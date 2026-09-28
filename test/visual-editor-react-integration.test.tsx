/**
 * MikaNotes Phase 5-1 Visual Editor + React Hook End-to-End Integration Test Suite
 *
 * Verifies the actual React component and hook execution pipeline:
 * AudioEngine -> useAudioEngine -> useEditor -> Visual Editor (TimelineEditor, Playhead, Lanes)
 * Visual Editor -> useEditor -> seekTime() -> AudioEngine.seek()
 *
 * Test paths:
 * 1. Playhead follows audio time during active playback (DOM style.left reflection)
 * 2. Pause strictly preserves playhead position
 * 3. Stop resets time and playhead to 0 (Measure 0 start)
 * 4. WaveformArea tap seeks useEditor and AudioEngine
 * 5. MeasureHeader tap seeks useEditor and AudioEngine
 * 6. NoteLane tap seeks useEditor and AudioEngine
 * 7. GogoLane tap seeks useEditor and AudioEngine
 * 8. BpmLane tap seeks useEditor and AudioEngine
 * 9. MeasureLane tap seeks useEditor and AudioEngine
 * 10. OFFSET ± bidirectional synchronization in React environment
 * 11. Audio replacement A -> B in useEditor
 * 12. Same-name audio replacement A -> B
 * 13. Audio-less playback mode in useEditor + TimelineEditor
 * 14. Audio ended event handling in useEditor + Playhead
 * 15. Zero divergence between React state and AudioEngine state
 */

import { JSDOM } from 'jsdom';

// Setup JSDOM environment BEFORE importing React or components
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
} catch {}
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).MouseEvent = dom.window.MouseEvent;
(globalThis as any).PointerEvent = dom.window.PointerEvent || dom.window.MouseEvent;

// Mock Audio implementation for Node/JSDOM
class MockAudioElement {
  public src = '';
  public currentTime = 0;
  public duration = 180.0;
  public paused = true;
  public volume = 1.0;
  public playbackRate = 1.0;
  public ended = false;
  private listeners: Record<string, ((e?: any) => void)[]> = {};

  addEventListener(event: string, handler: (e?: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (e?: any) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }

  dispatchEvent(event: string, detail?: any) {
    const handlers = this.listeners[event] || [];
    for (const h of handlers) h(detail);
  }

  async play() {
    this.paused = false;
    this.dispatchEvent('play');
  }

  pause() {
    this.paused = true;
    this.dispatchEvent('pause');
  }

  load() {
    queueMicrotask(() => {
      this.dispatchEvent('loadedmetadata');
      this.dispatchEvent('canplay');
    });
  }
}

(dom.window as any).Audio = MockAudioElement;
(globalThis as any).Audio = MockAudioElement;
(dom.window as any).URL = {
  createObjectURL: (blob: any) => `blob:mock-react-url-${Math.random()}`,
  revokeObjectURL: (url: string) => {},
};
(globalThis as any).URL = (dom.window as any).URL;

// High-precision RAF mock
let rafCallbacks: Map<number, FrameRequestCallback> = new Map();
let rafIdCounter = 0;
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  const id = ++rafIdCounter;
  rafCallbacks.set(id, cb);
  setTimeout(() => {
    if (rafCallbacks.has(id)) {
      rafCallbacks.delete(id);
      cb(performance.now());
    }
  }, 16);
  return id;
};
(globalThis as any).cancelAnimationFrame = (id: number) => {
  rafCallbacks.delete(id);
};
(dom.window as any).requestAnimationFrame = (globalThis as any).requestAnimationFrame;
(dom.window as any).cancelAnimationFrame = (globalThis as any).cancelAnimationFrame;

// Import React and React DOM Client
import React, { act, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useEditor } from '../src/editor/use-editor';
import { TimelineEditor } from '../src/components/editor/TimelineEditor';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
  passedTests++;
}

function assertClose(a: number, b: number, epsilon = 0.01, message: string) {
  totalTests++;
  const diff = Math.abs(a - b);
  if (diff > epsilon) {
    console.error(`  ✗ [FAIL] ${message} (expected ~${b}, got ${a}, diff: ${diff})`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
  passedTests++;
}

function createMockAudioFile(name: string, size = 2048): File {
  return {
    name,
    size,
    type: 'audio/ogg',
    slice: () => new Blob(),
  } as unknown as File;
}

// Master TJA fixture: 4 measures with OFFSET, BPMCHANGE, MEASURE, DELAY
const MASTER_TJA = `
TITLE:Visual Editor React Integration Master
BPM:120
WAVE:track.ogg
OFFSET:-1.0

COURSE:Oni
LEVEL:10

#START
// Measure 0: 4/4 at BPM 120 (Duration: 2.0s, starts at 0.0s)
10201020,
// Measure 1: #BPMCHANGE 240 (Duration: 1.0s, starts at 2.0s)
#BPMCHANGE 240
11112222,
// Measure 2: #MEASURE 3/4 (Duration: 0.75s, starts at 3.0s)
#MEASURE 3/4
112200,
// Measure 3: #DELAY 0.5s + 4/4 at BPM 120 (Duration: 2.5s, starts at 3.75s)
#BPMCHANGE 120
#MEASURE 4/4
#DELAY 0.5
10201020,
#END
`;

interface HarnessProps {
  key?: string;
  initialTja: string;
  onEditorReady: (editor: ReturnType<typeof useEditor>) => void;
}

function VisualEditorHarness({ initialTja, onEditorReady }: HarnessProps) {
  const editor = useEditor({ initialTjaText: initialTja });

  useEffect(() => {
    onEditorReady(editor);
  });

  return (
    <div id="test-harness-wrapper" style={{ width: '1200px', height: '600px' }}>
      <TimelineEditor
        course={editor.activeCourse}
        timeline={editor.timeline}
        layout={editor.timelineLayout}
        currentTime={editor.currentTime}
        activeMeasureIndex={editor.activeMeasureIndex}
        zoom={editor.zoom}
        selectedGrid={editor.selectedGrid}
        isPlaying={editor.isPlaying}
        onTapTimeline={editor.handleTimelineTap}
        onSelectMeasure={editor.seekToMeasure}
        onZoomIn={editor.zoomIn}
        onZoomOut={editor.zoomOut}
        onResetZoom={() => editor.setZoomPercent(100)}
        pendingSpecialNote={editor.pendingSpecialNote}
        notification={editor.notification}
        audioEngine={editor.audioEngine}
        chartOffset={editor.chart.headers.offset || 0}
        onSeekTimelineX={editor.seekTimelineX}
      />
    </div>
  );
}

function dispatchTap(element: Element, clientX: number) {
  const clickEvent = new dom.window.MouseEvent('click', {
    clientX,
    clientY: 10,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(clickEvent);
}

async function runVisualEditorReactIntegrationTests() {
  console.log('=== MikaNotes Phase 5-1 Visual Editor + React Hook Integration Test Suite ===\n');

  const rootElement = dom.window.document.getElementById('root')!;
  let root: Root = createRoot(rootElement);
  let latestEditor: ReturnType<typeof useEditor> | null = null;
  const ed = () => latestEditor!;

  let harnessMountCount = 0;
  const mountHarness = async (tjaText: string) => {
    harnessMountCount++;
    await act(async () => {
      root.render(
        <VisualEditorHarness
          key={`harness-${harnessMountCount}`}
          initialTja={tjaText}
          onEditorReady={(editor) => {
            latestEditor = editor;
          }}
        />
      );
    });
    await new Promise((r) => setTimeout(r, 10));
  };

  await mountHarness(MASTER_TJA);
  assert(latestEditor !== null, 'VisualEditorHarness mounted and useEditor initialized');

  // Verify DOM rendered correctly
  const playheadEl = dom.window.document.getElementById('playhead-cursor') as HTMLDivElement;
  assert(playheadEl !== null, 'Playhead cursor element rendered in DOM');
  const waveformEl = dom.window.document.getElementById('waveform-area')!;
  assert(waveformEl !== null, 'WaveformArea element rendered in DOM');
  const measureHeaderEl = dom.window.document.getElementById('measure-header-lane')!;
  assert(measureHeaderEl !== null, 'MeasureHeader element rendered in DOM');
  const noteLaneEl = dom.window.document.getElementById('note-lane')!;
  assert(noteLaneEl !== null, 'NoteLane element rendered in DOM');
  const gogoLaneEl = dom.window.document.getElementById('gogo-lane')!;
  assert(gogoLaneEl !== null, 'GogoLane element rendered in DOM');
  const bpmLaneEl = dom.window.document.getElementById('bpm-lane')!;
  assert(bpmLaneEl !== null, 'BpmLane element rendered in DOM');
  const measureLaneEl = dom.window.document.getElementById('measure-lane')!;
  assert(measureLaneEl !== null, 'MeasureLane element rendered in DOM');

  const offset = ed().chart.headers.offset || 0; // -1.0s

  // --- 1. Playhead follows audio time during active playback ---
  console.log('--- 1. Playhead follows audio time during active playback ---');
  {
    // Load audio file into editor
    await act(async () => {
      await ed().loadAudioFile(createMockAudioFile('track.ogg'));
    });
    assert(ed().audioState.loadState === 'loaded', 'Audio file loaded through useEditor');
    assert(ed().audioEngine.isLoaded() === true, 'AudioEngine confirms loaded');

    // Initial position: 0.0s (Measure 0 start)
    const m0StartX = ed().timelineLayout.measures[0].startX;
    assert(playheadEl.style.left === `${m0StartX}px`, `Playhead initially at Measure 0 start (${m0StartX}px)`);

    // Start playback
    await act(async () => {
      await ed().togglePlayback();
    });
    assert(ed().isPlaying === true, 'useEditor isPlaying is true');
    assert(ed().audioEngine.getState().isPlaying === true, 'AudioEngine isPlaying is true');

    // Simulate high-frequency audio tick during playback:
    // Audio currentTime = 1.5s -> timeline time = 1.5 + (-1.0) = 0.5s (Measure 0, 25% progress)
    await act(async () => {
      ed().audioEngine.seek(1.5);
      await new Promise((r) => setTimeout(r, 100));
    });
    const expectedProgress = 0.5 / 2.0;
    const expectedX = m0StartX + expectedProgress * ed().timelineLayout.measures[0].width;
    const actualLeft = parseFloat(playheadEl.style.left);
    assertClose(actualLeft, expectedX, 0.5, 'Playhead cursor DOM style.left accurately tracks 60fps audio time');
  }

  // --- 2. Pause strictly preserves playhead position ---
  console.log('--- 2. Pause strictly preserves playhead position ---');
  {
    const beforePauseLeft = parseFloat(playheadEl.style.left);

    // Pause via togglePlayback
    await act(async () => {
      ed().togglePlayback();
    });
    assert(ed().isPlaying === false, 'useEditor isPlaying is false after pause');
    assert(ed().audioEngine.getState().isPlaying === false, 'AudioEngine isPlaying is false after pause');

    const afterPauseLeft = parseFloat(playheadEl.style.left);
    assertClose(afterPauseLeft, beforePauseLeft, 0.001, 'Playhead position strictly preserved on pause');
    assertClose(ed().currentTime, 0.5, 0.01, 'useEditor currentTime preserved on pause');
  }

  // --- 3. Stop resets time and playhead to 0 ---
  console.log('--- 3. Stop resets time and playhead to 0 ---');
  {
    await act(async () => {
      ed().stop();
    });
    assert(ed().isPlaying === false, 'isPlaying is false after stop()');
    assert(ed().currentTime === 0, 'useEditor currentTime is 0 after stop()');
    assert(ed().audioEngine.getCurrentTime() === 0, 'AudioEngine currentTime is 0 after stop()');
    const m0StartX = ed().timelineLayout.measures[0].startX;
    assert(playheadEl.style.left === `${m0StartX}px`, `Playhead DOM style.left reset to Measure 0 start (${m0StartX}px)`);
  }

  // --- 4. WaveformArea tap seeks useEditor and AudioEngine ---
  console.log('--- 4. WaveformArea tap seeks useEditor and AudioEngine ---');
  {
    // Tap Measure 1 start on WaveformArea (timelineX = m1.startX)
    const m1Layout = ed().timelineLayout.measures[1];
    await act(async () => {
      dispatchTap(waveformEl, m1Layout.startX);
    });
    assertClose(ed().currentTime, 2.0, 0.01, 'WaveformArea tap updated useEditor.currentTime to 2.0s');
    // Audio time = 2.0 - (-1.0) = 3.0s
    assertClose(ed().audioEngine.getCurrentTime(), 3.0, 0.01, 'WaveformArea tap updated AudioEngine currentTime to 3.0s');
    assert(playheadEl.style.left === `${m1Layout.startX}px`, 'Playhead jumped to Measure 1 start');
  }

  // --- 5. MeasureHeader tap seeks useEditor and AudioEngine ---
  console.log('--- 5. MeasureHeader tap seeks useEditor and AudioEngine ---');
  {
    // Tap Measure 2 on MeasureHeader
    const m2Layout = ed().timelineLayout.measures[2];
    await act(async () => {
      dispatchTap(measureHeaderEl, m2Layout.startX + 10);
    });
    assertClose(ed().currentTime, 3.0, 0.01, 'MeasureHeader tap sought useEditor to Measure 2 start (3.0s)');
    assertClose(ed().audioEngine.getCurrentTime(), 4.0, 0.01, 'MeasureHeader tap sought AudioEngine to 4.0s (3.0s - offset)');
    assert(playheadEl.style.left === `${m2Layout.startX}px`, 'Playhead positioned at Measure 2 start');
  }

  // --- 6. NoteLane tap seeks useEditor and AudioEngine ---
  console.log('--- 6. NoteLane tap seeks useEditor and AudioEngine ---');
  {
    // Tap Measure 0 on NoteLane
    const m0Layout = ed().timelineLayout.measures[0];
    await act(async () => {
      dispatchTap(noteLaneEl, m0Layout.startX);
    });
    assertClose(ed().currentTime, 0.0, 0.01, 'NoteLane tap sought useEditor to 0.0s');
    assertClose(ed().audioEngine.getCurrentTime(), 1.0, 0.01, 'NoteLane tap sought AudioEngine to 1.0s (0.0s - offset)');
  }

  // --- 7. GogoLane tap seeks useEditor and AudioEngine ---
  console.log('--- 7. GogoLane tap seeks useEditor and AudioEngine ---');
  {
    // Tap Measure 1 on GogoLane
    const m1Layout = ed().timelineLayout.measures[1];
    await act(async () => {
      dispatchTap(gogoLaneEl, m1Layout.startX);
    });
    assertClose(ed().currentTime, 2.0, 0.01, 'GogoLane tap sought useEditor to 2.0s');
    assertClose(ed().audioEngine.getCurrentTime(), 3.0, 0.01, 'GogoLane tap sought AudioEngine to 3.0s');
  }

  // --- 8. BpmLane tap seeks useEditor and AudioEngine ---
  console.log('--- 8. BpmLane tap seeks useEditor and AudioEngine ---');
  {
    // Tap Measure 2 on BpmLane
    const m2Layout = ed().timelineLayout.measures[2];
    await act(async () => {
      dispatchTap(bpmLaneEl, m2Layout.startX);
    });
    assertClose(ed().currentTime, 3.0, 0.01, 'BpmLane tap sought useEditor to 3.0s');
    assertClose(ed().audioEngine.getCurrentTime(), 4.0, 0.01, 'BpmLane tap sought AudioEngine to 4.0s');
  }

  // --- 9. MeasureLane tap seeks useEditor and AudioEngine ---
  console.log('--- 9. MeasureLane tap seeks useEditor and AudioEngine ---');
  {
    // Tap Measure 3 on MeasureLane
    const m3Layout = ed().timelineLayout.measures[3];
    await act(async () => {
      dispatchTap(measureLaneEl, m3Layout.startX);
    });
    assertClose(ed().currentTime, 3.75, 0.01, 'MeasureLane tap sought useEditor to Measure 3 (3.75s)');
    assertClose(ed().audioEngine.getCurrentTime(), 4.75, 0.01, 'MeasureLane tap sought AudioEngine to 4.75s (3.75s - offset)');
  }

  // --- 10. OFFSET ± bidirectional synchronization in React environment ---
  console.log('--- 10. OFFSET ± bidirectional synchronization in React environment ---');
  {
    // Negative OFFSET (-1.0s) was verified above.
    // Now test chart with Positive OFFSET (+1.5s)
    const POSITIVE_OFFSET_TJA = `
TITLE:Positive Offset Test
BPM:120
OFFSET:1.5
COURSE:Oni
#START
10201020,
#END
`;
    await mountHarness(POSITIVE_OFFSET_TJA);
    assert(ed().chart.headers.offset === 1.5, 'Positive offset 1.5s parsed');

    await act(async () => {
      await ed().loadAudioFile(createMockAudioFile('pos.ogg'));
    });

    // Audio time 0.0s -> timeline time = 0.0 + 1.5 = 1.5s
    // Seeking timeline 1.5s should seek Audio to 0.0s
    await act(async () => {
      ed().seekTime(1.5);
    });
    assertClose(ed().currentTime, 1.5, 0.001, 'Timeline time at 1.5s');
    assertClose(ed().audioEngine.getCurrentTime(), 0.0, 0.001, 'AudioEngine seek at 1.5s - 1.5s = 0.0s');

    // Seeking timeline 3.0s should seek Audio to 1.5s
    await act(async () => {
      ed().seekTime(3.0);
    });
    assertClose(ed().currentTime, 3.0, 0.001, 'Timeline time at 3.0s');
    assertClose(ed().audioEngine.getCurrentTime(), 1.5, 0.001, 'AudioEngine seek at 3.0s - 1.5s = 1.5s');

    // Re-mount master fixture for subsequent tests
    await mountHarness(MASTER_TJA);
  }

  // --- 11. Audio replacement A -> B in useEditor ---
  console.log('--- 11. Audio replacement A -> B in useEditor ---');
  {
    // Load file A
    await act(async () => {
      await ed().loadAudioFile(createMockAudioFile('alpha.ogg'));
    });
    assert(ed().audioState.fileName === 'alpha.ogg', 'File A (alpha.ogg) loaded');

    // Seek to 10s
    await act(async () => {
      ed().seekTime(10);
    });
    assert(ed().currentTime === 10, 'Editor currentTime is 10s');

    // Replace with file B (beta.ogg)
    await act(async () => {
      await ed().loadAudioFile(createMockAudioFile('beta.ogg'));
    });
    assert(ed().audioState.fileName === 'beta.ogg', 'File B (beta.ogg) replaced File A');
    assert(ed().currentTime === 0, 'Editor currentTime reset to 0 after loading File B');
    assertClose(ed().audioEngine.getCurrentTime(), 0 - offset, 0.001, 'AudioEngine currentTime reset to timeline 0s (1.0s with OFFSET -1.0s)');
    assert(ed().isPlaying === false, 'Playback paused after loading File B');
  }

  // --- 12. Same-name audio replacement A -> B ---
  console.log('--- 12. Same-name audio replacement A -> B ---');
  {
    // Load beta.ogg again
    await act(async () => {
      await ed().loadAudioFile(createMockAudioFile('beta.ogg'));
    });
    assert(ed().audioState.fileName === 'beta.ogg', 'Same-name file beta.ogg reloaded cleanly');
    assert(ed().audioState.loadState === 'loaded', 'Load state is loaded');
    assert(ed().currentTime === 0, 'Time reset to 0 on same-name reload');
    assert(ed().audioState.errorMessage === null, 'Error message is null on same-name reload');
  }

  // --- 13. Audio-less playback mode in useEditor + TimelineEditor ---
  console.log('--- 13. Audio-less playback mode in useEditor + TimelineEditor ---');
  {
    // Mount a clean chart with no audio loaded
    await mountHarness(MASTER_TJA);
    assert(ed().audioState.loadState === 'unloaded', 'Engine is initially unloaded');

    // Initial playhead position is Measure 0 start
    const m0StartX = ed().timelineLayout.measures[0].startX;
    const playhead = dom.window.document.getElementById('playhead-cursor') as HTMLDivElement;
    assert(playhead.style.left === `${m0StartX}px`, 'Audio-less playhead starts at Measure 0');

    // Start playback without audio
    await act(async () => {
      await ed().togglePlayback();
    });
    assert(ed().isPlaying === true, 'Audio-less playback isPlaying is true');

    // Seek while audio-less
    await act(async () => {
      ed().seekTime(2.0);
    });
    assert(ed().currentTime === 2.0, 'Audio-less seek sets currentTime to 2.0s');
    const m1StartX = ed().timelineLayout.measures[1].startX;
    assert(playhead.style.left === `${m1StartX}px`, 'Audio-less playhead jumped to Measure 1 start');

    // Pause audio-less
    await act(async () => {
      ed().togglePlayback();
    });
    assert(ed().isPlaying === false, 'Audio-less paused');
    assert(playhead.style.left === `${m1StartX}px`, 'Audio-less pause preserved playhead position');

    // Stop audio-less
    await act(async () => {
      ed().stop();
    });
    assert(ed().currentTime === 0, 'Audio-less stop reset currentTime to 0');
    assert(playhead.style.left === `${m0StartX}px`, 'Audio-less stop reset playhead to 0');
  }

  // --- 14. Audio ended event handling in useEditor + Playhead ---
  console.log('--- 14. Audio ended event handling in useEditor + Playhead ---');
  {
    await act(async () => {
      await ed().loadAudioFile(createMockAudioFile('ended_test.ogg'));
    });

    // Start playback
    await act(async () => {
      await ed().togglePlayback();
    });
    assert(ed().isPlaying === true, 'Playing before ended event');

    // Trigger ended event on AudioEngine at audio duration
    await act(async () => {
      const mockAudio = (ed().audioEngine as any).audio;
      if (mockAudio) {
        mockAudio.currentTime = mockAudio.duration;
        mockAudio.dispatchEvent('ended');
      }
    });

    assert(ed().isPlaying === false, 'useEditor isPlaying became false on ended event');
    assert(ed().audioState.isPlaying === false, 'audioState isPlaying became false on ended event');
    const expectedEndTime = ed().audioState.duration + (ed().chart.headers.offset || 0);
    assertClose(ed().currentTime, expectedEndTime, 0.01, 'useEditor currentTime sits at ended time');
  }

  // --- 15. Zero divergence between React state and AudioEngine state ---
  console.log('--- 15. Zero divergence between React state and AudioEngine state ---');
  {
    // Test across several seek checkpoints
    const testPoints = [0.0, 1.0, 2.5, 4.0, 5.5];
    const offset = ed().chart.headers.offset || 0;

    for (const pt of testPoints) {
      await act(async () => {
        ed().seekTime(pt);
      });

      // 1. Current time alignment
      assertClose(ed().currentTime, pt, 0.001, `React currentTime is ${pt}s`);
      const expectedAudioTime = pt - offset;
      assertClose(ed().audioEngine.getCurrentTime(), expectedAudioTime, 0.001, `AudioEngine currentTime is ${expectedAudioTime}s`);

      // 2. Playback state alignment
      assert(ed().isPlaying === ed().audioState.isPlaying, `isPlaying React (${ed().isPlaying}) matches audioState (${ed().audioState.isPlaying})`);
      assert(ed().isPlaying === ed().audioEngine.getState().isPlaying, `isPlaying React matches AudioEngine state`);

      // 3. Duration alignment
      assert(ed().audioState.duration === ed().audioEngine.getDuration(), 'Duration matches between React audioState and AudioEngine');
    }
  }

  console.log('\n==================================================');
  console.log(`Phase 5-1 React Integration Verification Complete: ${passedTests} / ${totalTests} tests passed.`);
  console.log('🎉 ALL VISUAL EDITOR ↔ USE-EDITOR ↔ AUDIOENGINE INTEGRATION TESTS CONFIRMED SUCCESSFUL!');
  console.log('==================================================');
}

runVisualEditorReactIntegrationTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
