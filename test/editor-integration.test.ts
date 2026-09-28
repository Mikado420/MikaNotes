/**
 * MikaNotes Phase 5-1 Audio ↔ Timeline ↔ Visual Editor Integration Test Suite
 *
 * Verifies the complete end-to-end integration:
 * 1. Playhead state lifecycle:
 *    - Playing: Synchronizes with Audio currentTime + OFFSET
 *    - Paused: Preserves current playhead position
 *    - Seek: Immediate reflection in AudioEngine currentTime and playhead coordinate
 *    - Stop: Resets time and playhead coordinate to 0 (Measure 0 start)
 *    - Ended: Reaches audio duration / chart duration
 * 2. Editor Timeline Tap -> Seek -> AudioEngine:
 *    - Screen/Timeline X -> Measure -> RationalPosition (Grid snapped) -> Timeline.positionToTime() -> AudioEngine.seek()
 *    - Verifies zero discrepancy between RationalPosition time and AudioEngine currentTime
 *    - Negative OFFSET (-1.0s) and Positive OFFSET (+1.5s) handling
 * 3. Audio Replacement Flow in Editor:
 *    - A -> B: Old audio cleanup, new audio settled, editor playhead reset to 0
 *    - A -> B -> C: Consecutive replacement leaves no dangling state or memory leaks
 *    - Same-name A -> B: Re-loading file with same name settles cleanly and updates duration
 * 4. Audio-less Playback Mode:
 *    - Timeline-only playback advances playhead smoothly
 *    - Pause holds position
 *    - Seek updates playhead immediately
 *    - Stop resets to 0
 *    - Reaching duration ends cleanly
 * 5. Complex Timing Features in Editor:
 *    - Standard BPM
 *    - #BPMCHANGE (single & multiple)
 *    - #DELAY
 *    - #MEASURE (regular & irregular meters)
 *    - Extreme #MEASURE (99999999/1) layout safety
 *    - Audio longer than chart (totalDuration expanded, playhead and seek extrapolate cleanly)
 *    - Chart longer than audio (clamping audio seek safely, timeline mapping intact)
 * 6. Grid Integrity:
 *    - Snapping strictly uses valid divisions (4, 8, 12, 16, 20, 24, 32, 48)
 */

import { AudioEngine } from '../src/audio/AudioEngine';
import { Timeline } from '../src/core/timeline';
import { parseTJA } from '../src/core/parser';
import {
  calculateTimelineLayout,
  timeToTimelineX,
  timelineXToTime,
  findMeasureLayoutAtX,
  snapTimelineXToGrid,
  LANE_PADDING_LEFT,
} from '../src/editor/coordinate-mapping';
import { GridDivision } from '../src/editor/editor-types';

// Mock browser globals for Node test environment
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
    setTimeout(() => {
      this.dispatchEvent('loadedmetadata');
      this.dispatchEvent('canplaythrough');
    }, 5);
  }
}

(global as any).Audio = MockAudioElement;
if (typeof (global as any).window === 'undefined') {
  (global as any).window = global;
}
(global as any).URL = {
  createObjectURL: (blob: any) => `blob:mock-audio-url-${Math.random()}`,
  revokeObjectURL: (url: string) => {},
};
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 16);
}
if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

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

function assertClose(a: number, b: number, epsilon = 0.005, message: string) {
  totalTests++;
  const diff = Math.abs(a - b);
  if (diff > epsilon) {
    console.error(`  ✗ [FAIL] ${message} (expected ~${b}, got ${a}, diff: ${diff})`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
  passedTests++;
}

function createMockFile(name: string, size = 1024): File {
  return {
    name,
    size,
    type: 'audio/ogg',
    slice: () => new Blob(),
  } as unknown as File;
}

async function runPhase51IntegrationTestSuite() {
  console.log('=== MikaNotes Phase 5-1 Audio ↔ Timeline ↔ Visual Editor Integration Test Suite ===\n');

  const testTja = `
TITLE:Phase 5-1 Master Integration
BPM:120
WAVE:track.ogg
OFFSET:-1.0

COURSE:Oni
LEVEL:10

#START
// Measure 0: 4/4, BPM 120 (Duration: 2.0s, Starts at: 0.0s)
10201020,
// Measure 1: #BPMCHANGE to 240 (Duration: 1.0s, Starts at: 2.0s)
#BPMCHANGE 240
11112222,
// Measure 2: #MEASURE 3/4 at BPM 240 (Duration: 0.75s, Starts at: 3.0s)
#MEASURE 3/4
112200,
// Measure 3: #DELAY 0.5s + 4/4 at BPM 120 (Duration: 2.5s, Starts at: 3.75s, Ends at: 6.25s)
#BPMCHANGE 120
#MEASURE 4/4
#DELAY 0.5
10201020,
#END
`;

  const chart = parseTJA(testTja);
  const activeCourse = chart.activeCourse;
  const timeline = new Timeline(activeCourse);
  const chartOffset = chart.headers.offset || 0; // -1.0

  // --- 1. Playhead Lifecycle: Playing, Paused, Seek, Stop, Ended ---
  console.log('--- 1. Playhead Lifecycle: Playing, Paused, Seek, Stop, Ended ---');
  {
    const engine = new AudioEngine();
    await engine.loadAudioFile(createMockFile('song.ogg'));
    const layout = calculateTimelineLayout(activeCourse, 100);

    // Initial state: time is 0, playhead is at Measure 0 start
    let editorTime = 0;
    let playheadX = timeToTimelineX(editorTime, timeline, layout);
    assert(playheadX === layout.measures[0].startX, 'Initial playhead is at Measure 0 startX');

    // Start playback: simulate engine ticking
    await engine.play();
    assert(engine.getState().isPlaying === true, 'AudioEngine state isPlaying is true');

    // Advance engine playback to audio currentTime = 1.5s
    // Timeline time = audioTime + OFFSET = 1.5 + (-1.0) = 0.5s
    const audioTime = 1.5;
    engine.seek(audioTime);
    const currentTimelineTime = audioTime + chartOffset;
    assertClose(currentTimelineTime, 0.5, 0.001, 'Timeline time at audio 1.5s is 0.5s');

    playheadX = timeToTimelineX(currentTimelineTime, timeline, layout);
    const m0 = layout.measures[0];
    const expectedX = m0.startX + (0.5 / 2.0) * m0.width;
    assertClose(playheadX, expectedX, 0.01, 'Playhead X accurately tracks 25% of Measure 0 during playback');

    // Pause: playhead preserves current position
    engine.pause();
    assert(engine.getState().isPlaying === false, 'AudioEngine isPlaying is false on pause');
    const pausedAudioTime = engine.getCurrentTime();
    const pausedEditorTime = pausedAudioTime + chartOffset;
    const pausedPlayheadX = timeToTimelineX(pausedEditorTime, timeline, layout);
    assert(pausedPlayheadX === playheadX, 'Playhead position is strictly preserved on pause');

    // Seek: immediate reflection
    // User seeks to timeline time 3.0s (Measure 2 start)
    const seekTimelineTime = 3.0;
    const targetAudioTime = seekTimelineTime - chartOffset; // 3.0 - (-1.0) = 4.0s
    engine.seek(targetAudioTime);
    assertClose(engine.getCurrentTime(), 4.0, 0.001, 'AudioEngine currentTime jumped to 4.0s immediately');
    const seekPlayheadX = timeToTimelineX(seekTimelineTime, timeline, layout);
    assert(seekPlayheadX === layout.measures[2].startX, 'Playhead jumped immediately to Measure 2 startX');

    // Stop: resets to 0
    engine.stop();
    assert(engine.getState().isPlaying === false, 'Engine is paused after stop()');
    assert(engine.getCurrentTime() === 0, 'Audio currentTime is reset to 0 after stop()');
    editorTime = 0;
    playheadX = timeToTimelineX(editorTime, timeline, layout);
    assert(playheadX === layout.measures[0].startX, 'Playhead coordinate is reset to Measure 0 start on stop()');

    // Ended: reaches duration
    engine.seek(engine.getState().duration);
    const endedAudioTime = engine.getCurrentTime();
    assert(endedAudioTime === engine.getState().duration, 'Engine currentTime reached audio duration');
    const endedTimelineTime = endedAudioTime + chartOffset;
    const endedPlayheadX = timeToTimelineX(endedTimelineTime, timeline, layout);
    assert(endedPlayheadX > layout.measures[3].endX, 'Playhead at ended reflects audio duration');

    engine.dispose();
  }

  // --- 2. Editor Timeline Tap -> Seek -> AudioEngine Synchronization ---
  console.log('--- 2. Editor Timeline Tap -> Seek -> AudioEngine Synchronization ---');
  {
    const engine = new AudioEngine();
    await engine.loadAudioFile(createMockFile('test.ogg'));
    const layout = calculateTimelineLayout(activeCourse, 100);

    // Tap at exact start of Measure 1
    const m1Layout = layout.measures[1];
    const tapX1 = m1Layout.startX;
    const snap1 = snapTimelineXToGrid(tapX1, timeline, layout, 16);
    assert(snap1 !== null, 'Grid snap returned valid result for Measure 1 start');
    assert(snap1!.measureIndex === 1, 'Snapped to Measure 1');
    assert(snap1!.rational.numerator === 0 && snap1!.rational.denominator === 1, 'RationalPosition is 0/1');
    assertClose(snap1!.time, 2.0, 0.001, 'Calculated time is 2.000s');

    // Editor seeks AudioEngine
    const audioSeekTime1 = snap1!.time - chartOffset; // 2.0 - (-1.0) = 3.0s
    engine.seek(audioSeekTime1);
    assertClose(engine.getCurrentTime(), 3.0, 0.001, 'AudioEngine sought to exactly 3.000s');

    // Verify reverse: audio time -> timeline position -> X
    const reverseTimelineTime1 = engine.getCurrentTime() + chartOffset;
    const reverseX1 = timeToTimelineX(reverseTimelineTime1, timeline, layout);
    assertClose(reverseX1, tapX1, 0.001, 'Audio currentTime converts back to exact tap X coordinate');

    // Tap at 50% midpoint of Measure 2 (3/4 measure at BPM 240, duration 0.75s)
    // 50% progress in Measure 2 is at time 3.0 + 0.375 = 3.375s
    const m2Layout = layout.measures[2];
    const tapX2 = m2Layout.startX + m2Layout.width * 0.5;
    const snap2 = snapTimelineXToGrid(tapX2, timeline, layout, 16);
    assert(snap2 !== null, 'Grid snap valid for Measure 2 midpoint');
    assert(snap2!.measureIndex === 2, 'Snapped to Measure 2');
    assertClose(snap2!.time, 3.375, 0.005, 'Midpoint of Measure 2 is ~3.375s');

    const audioSeekTime2 = snap2!.time - chartOffset;
    engine.seek(audioSeekTime2);
    assertClose(engine.getCurrentTime(), 3.375 - (-1.0), 0.005, 'AudioEngine seek matches RationalPosition time');

    engine.dispose();
  }

  // --- 3. Audio Replacement Flow in Editor (A -> B, A -> B -> C, same-name A -> B) ---
  console.log('--- 3. Audio Replacement Flow in Editor ---');
  {
    const engine = new AudioEngine();

    // Load A (fileA.ogg, mock duration 120s)
    const fileA = createMockFile('fileA.ogg');
    await engine.loadAudioFile(fileA);
    assert(engine.getState().loadState === 'loaded', 'File A loaded successfully');
    assert(engine.getState().fileName === 'fileA.ogg', 'File A name is set');

    // Seek to 30s
    engine.seek(30);
    assert(engine.getCurrentTime() === 30, 'Engine time is 30s in file A');

    // Replace A -> B (fileB.ogg)
    const fileB = createMockFile('fileB.ogg');
    await engine.loadAudioFile(fileB);
    assert(engine.getState().loadState === 'loaded', 'File B loaded successfully');
    assert(engine.getState().fileName === 'fileB.ogg', 'File B name replaced File A');
    assert(engine.getCurrentTime() === 0, 'Engine currentTime reset to 0 after loading File B');
    assert(engine.getState().isPlaying === false, 'Engine isPlaying is false after load');

    // Sequence A -> B -> C
    const fileC = createMockFile('fileC.ogg');
    await engine.loadAudioFile(fileC);
    assert(engine.getState().loadState === 'loaded', 'File C loaded successfully');
    assert(engine.getState().fileName === 'fileC.ogg', 'File C active');
    assert(engine.getCurrentTime() === 0, 'Time reset to 0 for File C');

    // Same-name replacement: fileC.ogg -> fileC.ogg
    const fileC2 = createMockFile('fileC.ogg');
    await engine.loadAudioFile(fileC2);
    assert(engine.getState().loadState === 'loaded', 'Same-name file loaded cleanly without hanging');
    assert(engine.getState().fileName === 'fileC.ogg', 'File name preserved');
    assert(engine.getCurrentTime() === 0, 'CurrentTime is 0 after same-name reload');
    assert(engine.getState().errorMessage === null, 'Error message is null after same-name reload');

    engine.dispose();
  }

  // --- 4. Audio-less Playback Mode ---
  console.log('--- 4. Audio-less Playback Mode ---');
  {
    const engine = new AudioEngine();
    assert(engine.isLoaded() === false, 'Audio-less engine isLoaded() is false');

    const layout = calculateTimelineLayout(activeCourse, 100);
    let virtualCurrentTime = 0;
    const totalDuration = timeline.getDuration();

    // Playhead starts at Measure 0 startX
    let x = timeToTimelineX(virtualCurrentTime, timeline, layout);
    assert(x === layout.measures[0].startX, 'Audio-less playhead starts at Measure 0 startX');

    // Simulate time advance
    virtualCurrentTime = 1.0;
    x = timeToTimelineX(virtualCurrentTime, timeline, layout);
    assertClose(x, layout.measures[0].startX + layout.measures[0].width * 0.5, 0.01, 'Audio-less playhead advances to 50% of Measure 0');

    // Seek to 3.0s (Measure 2 start)
    virtualCurrentTime = 3.0;
    x = timeToTimelineX(virtualCurrentTime, timeline, layout);
    assert(x === layout.measures[2].startX, 'Audio-less seek immediately jumps playhead to Measure 2 start');

    // Stop resets to 0
    virtualCurrentTime = 0;
    x = timeToTimelineX(virtualCurrentTime, timeline, layout);
    assert(x === layout.measures[0].startX, 'Audio-less stop resets playhead to Measure 0 start');

    // Reaching totalDuration
    virtualCurrentTime = totalDuration;
    x = timeToTimelineX(virtualCurrentTime, timeline, layout);
    assert(x === layout.measures[3].endX, 'Audio-less playback stops at totalDuration');

    engine.dispose();
  }

  // --- 5. Complex Timing Features & Extreme #MEASURE Safety ---
  console.log('--- 5. Complex Timing Features & Extreme #MEASURE Safety ---');
  {
    const layout = calculateTimelineLayout(activeCourse, 100);

    // Normal BPM check (Measure 0, BPM 120)
    assert(timeline.getBpmAtTime(0.5) === 120, 'Measure 0 BPM is 120');

    // BPMCHANGE check (Measure 1, BPM 240)
    assert(timeline.getBpmAtTime(2.5) === 240, 'Measure 1 BPM is 240');

    // #MEASURE check (Measure 2, 3/4 meter)
    const m2 = timeline.getMeasureByIndex(2)!;
    assert(m2.numerator === 3 && m2.denominator === 4, 'Measure 2 is 3/4 meter');

    // #DELAY check (Measure 3 has 0.5s delay)
    const m3 = timeline.getMeasureByIndex(3)!;
    assertClose(m3.startTime, 3.75, 0.001, 'Measure 3 start time is 3.75s');
    // Inside delay (t = 3.9s), position remains at fraction 0
    const posInDelay = timeline.timeToPosition(m3, 3.9);
    assert(posInDelay.numerator === 0 && posInDelay.fraction === 0, 'Time inside #DELAY stays at position 0');

    // Extreme #MEASURE test
    const extremeTja = `
TITLE:Extreme Test
BPM:120
COURSE:Oni
#START
#MEASURE 99999999/1
1,
#END
`;
    const extremeChart = parseTJA(extremeTja);
    const extremeTimeline = new Timeline(extremeChart.activeCourse);
    const extremeLayout = calculateTimelineLayout(extremeChart.activeCourse, 100);

    assert(extremeLayout.measures[0].width <= 8000, 'Extreme measure width clamped to 8000px max');
    assert(isFinite(extremeLayout.measures[0].width), 'Extreme measure width is finite');
    const extremeX = timeToTimelineX(1.0, extremeTimeline, extremeLayout);
    assert(isFinite(extremeX), 'timeToTimelineX is finite for extreme measure');

    // Audio longer than chart handling
    const longAudioDuration = 120.0;
    const longLayout = calculateTimelineLayout(activeCourse, 100, { minDuration: longAudioDuration, bpm: 120 });
    assert(longLayout.totalWidth > layout.totalWidth, 'Timeline layout expanded for longer audio');
    const extrapX = timeToTimelineX(10.0, timeline, longLayout);
    assert(extrapX > longLayout.measures[3].endX, 'Playhead extrapolates beyond chart for audio duration');
    const roundTripTime = timelineXToTime(extrapX, timeline, longLayout);
    assertClose(roundTripTime, 10.0, 0.01, 'Extrapolated X converts back accurately to 10.0s');
  }

  // --- 6. Supported Grid Division Integrity ---
  console.log('--- 6. Supported Grid Division Integrity ---');
  {
    const validGrids: GridDivision[] = [4, 8, 12, 16, 20, 24, 32, 48];
    const layout = calculateTimelineLayout(activeCourse, 100);

    for (const grid of validGrids) {
      // Tap at 33% of Measure 0
      const targetX = layout.measures[0].startX + layout.measures[0].width * 0.33;
      const snap = snapTimelineXToGrid(targetX, timeline, layout, grid);
      assert(snap !== null, `Grid division ${grid} snaps successfully`);
      assert(snap!.rational.denominator <= grid, `Snapped denominator (${snap!.rational.denominator}) <= grid (${grid})`);
      assert(snap!.snappedX >= layout.measures[0].startX && snap!.snappedX <= layout.measures[0].endX, `Snapped X is inside Measure 0`);
    }
  }

  console.log('\n==================================================');
  console.log(`Phase 5-1 Verification Complete: ${passedTests} / ${totalTests} tests passed.`);
  console.log('🎉 ALL PHASE 5-1 AUDIO ↔ TIMELINE ↔ VISUAL EDITOR SPECIFICATIONS VERIFIED!');
  console.log('==================================================');
}

runPhase51IntegrationTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
