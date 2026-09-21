/**
 * MikaNotes Phase 4-2 Audio ↔ Timeline Synchronization Test Suite
 *
 * Verifies bidirectional synchronization between AudioEngine and TEIKA Timing Engine:
 * 1. Audio -> Timeline Playhead Synchronization:
 *    Audio currentTime -> chartOffset -> Timeline.getMeasureAtTime() -> Timeline.timeToPosition() -> RationalPosition -> Playhead X
 * 2. Timeline -> Audio Seek Synchronization:
 *    Timeline X coordinate -> findMeasureLayoutAtX() -> RationalPosition -> Timeline.positionToTime() -> AudioEngine.seek()
 * 3. Measure Header Click / Tap:
 *    Measure m -> m.startTime -> Timeline.positionToTime() -> AudioEngine.seek()
 * 4. Offset Handling (both negative and positive):
 *    audioTime = timelineTime - OFFSET
 *    timelineTime = audioTime + OFFSET
 * 5. Dynamic BPM (#BPMCHANGE) & Time Signature (#MEASURE) Preservation:
 *    BPM variations and irregular meters maintain 1:1 reversible sync
 * 6. #DELAY Handling:
 *    Timing segments with delay maintain accurate mapping
 * 7. Zoom Factor Invariance:
 *    Zoom scaling updates layout widths while time-position-audio sync remains invariant
 * 8. Course Switching Resilience:
 *    Preserves playback time and sync across Easy / Normal / Hard / Oni / Edit courses
 * 9. Audio Completion & Seek Behavior:
 *    Seek while playing preserves playing state; seek while paused remains paused
 */

import { AudioEngine } from '../src/audio/AudioEngine';
import { Timeline } from '../src/core/timeline';
import { parseTJA } from '../src/core/parser';
import {
  calculateTimelineLayout,
  timeToTimelineX,
  timelineXToTime,
  findMeasureLayoutAtX,
} from '../src/editor/coordinate-mapping';

// Mock browser Audio for Node environment
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

  fastSeek(time: number) {
    this.currentTime = Math.max(0, Math.min(this.duration, time));
    this.dispatchEvent('timeupdate');
  }

  load() {
    setTimeout(() => {
      this.dispatchEvent('loadedmetadata');
      this.dispatchEvent('canplaythrough');
    }, 10);
  }
}

// Setup browser globals
(global as any).Audio = MockAudioElement;
if (typeof (global as any).window === 'undefined') {
  (global as any).window = global;
}
(global as any).URL = {
  createObjectURL: (blob: any) => 'blob:mock-audio-url-phase-4-2',
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

async function runPhase42SyncTestSuite() {
  console.log('=== MikaNotes Phase 4-2 Audio ↔ Timeline Synchronization Test Suite ===\n');

  // Multi-tempo, multi-meter TJA fixture with OFFSET, BPMCHANGE, MEASURE, and DELAY
  const complexTja = `
TITLE:Phase 4-2 Synchronization Master
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
// Measure 3: #DELAY 0.5s at BPM 120 (Duration: 2.5s total: 0.5s delay + 2.0s beats, Starts at: 3.75s)
#BPMCHANGE 120
#MEASURE 4/4
#DELAY 0.5
10201020,
#END

COURSE:Normal
LEVEL:5

#START
// Course: Normal - simpler measures
1000,
2000,
#END
`.trim();

  const chart = parseTJA(complexTja, { courseKey: 3 });
  const activeCourse = chart.courses[3] || chart.activeCourse;
  const timeline = new Timeline(activeCourse);
  const layout100 = calculateTimelineLayout(activeCourse, 1.0);
  const offset = chart.headers.offset || 0; // -1.0

  // -------------------------------------------------------------
  // Test 1: Timing Engine Core Verification
  // -------------------------------------------------------------
  console.log('--- 1. TEIKA Timing Engine Invariant Checks ---');
  assert(activeCourse.measures.length === 4, 'Chart parsed 4 measures in Oni course');
  assertClose(activeCourse.measures[0].startTime, 0.0, 0.001, 'Measure 0 starts at 0.000s');
  assertClose(activeCourse.measures[0].duration, 2.0, 0.001, 'Measure 0 (4/4 at BPM 120) duration is 2.000s');
  assertClose(activeCourse.measures[1].startTime, 2.0, 0.001, 'Measure 1 starts at 2.000s');
  assertClose(activeCourse.measures[1].duration, 1.0, 0.001, 'Measure 1 (4/4 at BPM 240) duration is 1.000s');
  assertClose(activeCourse.measures[2].startTime, 3.0, 0.001, 'Measure 2 starts at 3.000s');
  assertClose(activeCourse.measures[2].duration, 0.75, 0.001, 'Measure 2 (3/4 at BPM 240) duration is 0.750s');
  assertClose(activeCourse.measures[3].startTime, 3.75, 0.001, 'Measure 3 starts at 3.750s');
  assertClose(activeCourse.measures[3].duration, 2.5, 0.001, 'Measure 3 (#DELAY 0.5s + 4/4 at BPM 120) duration is 2.500s');
  assertClose(timeline.getDuration(), 6.25, 0.001, 'Total chart duration is 6.250s');

  // -------------------------------------------------------------
  // Test 2: Audio -> Timeline Forward Synchronization
  // -------------------------------------------------------------
  console.log('\n--- 2. Audio -> Timeline Forward Sync (Audio currentTime -> Playhead) ---');
  const engine = new AudioEngine();
  const mockFile = { name: 'track.ogg', size: 1024 * 1024 } as File;
  await engine.loadAudioFile(mockFile);

  // When Audio currentTime = 1.0s and OFFSET = -1.0s:
  // Timeline Time = Audio Time + OFFSET = 1.0 + (-1.0) = 0.0s (Measure 0 start)
  const audioTime1 = 1.0;
  const timelineTime1 = audioTime1 + offset;
  assertClose(timelineTime1, 0.0, 0.001, 'Audio time 1.0s maps to timeline 0.0s with OFFSET -1.0s');

  const mAt0 = timeline.getMeasureAtTime(timelineTime1);
  assert(mAt0 !== null && mAt0.index === 0, 'Measure at timeline 0.0s is Measure 0');
  const pos0 = timeline.timeToPosition(mAt0!, timelineTime1);
  assertClose(pos0.numerator / pos0.denominator, 0.0, 0.001, 'RationalPosition at Measure 0 start is 0/1');

  const x0 = timeToTimelineX(timelineTime1, timeline, layout100);
  assertClose(x0, layout100.measures[0].startX, 0.001, 'Playhead X matches Measure 0 startX exactly');

  // Audio time 2.0s -> Timeline Time 1.0s (Middle of Measure 0: 2 beats in at BPM 120)
  const audioTime2 = 2.0;
  const timelineTime2 = audioTime2 + offset; // 1.0s
  const mAt1 = timeline.getMeasureAtTime(timelineTime2);
  assert(mAt1 !== null && mAt1.index === 0, 'Measure at timeline 1.0s is still Measure 0');
  const pos1 = timeline.timeToPosition(mAt1!, timelineTime2);
  assertClose(pos1.numerator / pos1.denominator, 0.5, 0.001, 'RationalPosition at timeline 1.0s is exactly 1/2 (50%)');

  const x1 = timeToTimelineX(timelineTime2, timeline, layout100);
  const m0Layout = layout100.measures[0];
  assertClose(x1, m0Layout.startX + m0Layout.width * 0.5, 0.001, 'Playhead X is at exact 50% midpoint of Measure 0');

  // Audio time 4.5s -> Timeline Time 3.5s (Middle of Measure 2: 3/4 at BPM 240)
  const audioTime3 = 4.5;
  const timelineTime3 = audioTime3 + offset; // 3.5s
  const mAt2 = timeline.getMeasureAtTime(timelineTime3);
  assert(mAt2 !== null && mAt2.index === 2, 'Measure at timeline 3.5s is Measure 2');
  const pos2 = timeline.timeToPosition(mAt2!, timelineTime3);
  // Measure 2 starts at 3.0s, duration is 0.75s, so 3.5s is 0.5 / 0.75 = 2/3 progress
  assertClose(pos2.numerator / pos2.denominator, 2 / 3, 0.001, 'RationalPosition at 3.5s in Measure 2 is 2/3 progress');

  const x2 = timeToTimelineX(timelineTime3, timeline, layout100);
  const m2Layout = layout100.measures[2];
  assertClose(x2, m2Layout.startX + m2Layout.width * (2 / 3), 0.001, 'Playhead X at 3.5s is at 2/3 width of Measure 2');

  // -------------------------------------------------------------
  // Test 3: Timeline -> Audio Reverse Synchronization (Seek)
  // -------------------------------------------------------------
  console.log('\n--- 3. Timeline -> Audio Reverse Sync (User Tap/Click -> Audio Seek) ---');

  // User taps at start of Measure 1
  const m1Layout = layout100.measures[1];
  const tappedX = m1Layout.startX;
  const reconstructedTime = timelineXToTime(tappedX, timeline, layout100);
  assertClose(reconstructedTime, 2.0, 0.001, 'Tapping Measure 1 start converts back to exact timeline time 2.000s');

  // Compute target audio seek time
  const targetAudioSeek = reconstructedTime - offset; // 2.0 - (-1.0) = 3.0s
  engine.seek(targetAudioSeek);
  assertClose(engine.getCurrentTime(), 3.0, 0.001, 'AudioEngine seek successfully jumped to 3.000s');

  // User taps at 75% into Measure 1 (Measure 1 is 1.0s long at BPM 240, so 0.75 progress = 2.75s)
  const tap75X = m1Layout.startX + m1Layout.width * 0.75;
  const reconstructed75Time = timelineXToTime(tap75X, timeline, layout100);
  assertClose(reconstructed75Time, 2.75, 0.005, 'Tapping 75% into Measure 1 gives timeline time ~2.750s');
  engine.seek(reconstructed75Time - offset);
  assertClose(engine.getCurrentTime(), 3.75, 0.005, 'AudioEngine seek jumped to ~3.750s');

  // -------------------------------------------------------------
  // Test 4: Bidirectional Round-Trip Symmetry (X -> Time -> X)
  // -------------------------------------------------------------
  console.log('\n--- 4. Bidirectional Symmetry & Precision ---');
  const testSamplePoints = [0.0, 0.5, 1.25, 2.0, 2.333, 3.0, 3.5, 4.75, 5.5, 6.25];

  for (const t of testSamplePoints) {
    const x = timeToTimelineX(t, timeline, layout100);
    const roundTripTime = timelineXToTime(x, timeline, layout100);
    assertClose(roundTripTime, t, 0.005, `Round-trip time-X-time exact at t=${t.toFixed(3)}s`);
  }

  // Verify #DELAY freeze behavior:
  // Measure 3 starts at 3.75s with #DELAY 0.5s. During 3.75s <= t <= 4.25s,
  // playhead position is frozen at Measure 3 start (bar line).
  const delayTime = 4.0; // 0.25s into the 0.5s delay
  const delayX = timeToTimelineX(delayTime, timeline, layout100);
  const m3Layout = layout100.measures[3];
  assertClose(delayX, m3Layout.startX, 0.001, 'During #DELAY period, playhead holds at Measure 3 startX');
  const delayResolvedTime = timelineXToTime(delayX, timeline, layout100);
  assertClose(delayResolvedTime, 3.75, 0.001, 'Seeking at Measure 3 start resolves to measure startTime (3.750s)');

  // -------------------------------------------------------------
  // Test 5: Measure Header Tap Synchronization
  // -------------------------------------------------------------
  console.log('\n--- 5. Measure Header Selection & Jump ---');
  for (let mIdx = 0; mIdx < activeCourse.measures.length; mIdx++) {
    const targetM = activeCourse.measures[mIdx];
    const targetTime = targetM.startTime;
    const targetAudio = targetTime - offset;
    engine.seek(targetAudio);

    assertClose(engine.getCurrentTime(), targetAudio, 0.001, `Measure ${mIdx} header jump seeks audio to ${targetAudio.toFixed(3)}s`);
    const headerPlayheadX = timeToTimelineX(targetTime, timeline, layout100);
    assertClose(headerPlayheadX, layout100.measures[mIdx].startX, 0.001, `Measure ${mIdx} playhead sits on measure start border`);
  }

  // -------------------------------------------------------------
  // Test 6: Zoom Invariance
  // -------------------------------------------------------------
  console.log('\n--- 6. Zoom Factor Invariance (50%, 100%, 150%, 200%) ---');
  const zoomLevels = [0.5, 0.75, 1.0, 1.5, 2.0];
  const testTime = 3.25; // 0.25s into Measure 2

  for (const z of zoomLevels) {
    const layoutZ = calculateTimelineLayout(activeCourse, z);
    const xZ = timeToTimelineX(testTime, timeline, layoutZ);
    const convertedTimeZ = timelineXToTime(xZ, timeline, layoutZ);
    assertClose(convertedTimeZ, testTime, 0.005, `Zoom ${z * 100}% converts back to exact time ${testTime}s`);
  }

  // -------------------------------------------------------------
  // Test 7: Positive OFFSET Handling
  // -------------------------------------------------------------
  console.log('\n--- 7. Positive OFFSET (+1.500s) Handling ---');
  const posOffsetTja = `
TITLE:Positive Offset Test
BPM:120
WAVE:track.ogg
OFFSET:1.5

COURSE:Oni
LEVEL:10
#START
10201020,
#END
`.trim();
  const posChart = parseTJA(posOffsetTja);
  const posTimeline = new Timeline(posChart.activeCourse);
  const posLayout = calculateTimelineLayout(posChart.activeCourse, 1.0);
  const posOffset = posChart.headers.offset; // 1.5

  // When audioTime = 0.0s, timelineTime = 0.0 + 1.5 = 1.5s
  const posTimelineTime = 0.0 + posOffset;
  assertClose(posTimelineTime, 1.5, 0.001, 'Positive offset 1.5s shifts initial timeline time to 1.5s at audio 0s');

  // When user seeks timeline to Measure 0 start (0.0s), audioTime = 0.0 - 1.5 = -1.5s -> clamped to 0.0s
  engine.seek(0.0 - posOffset);
  assertClose(engine.getCurrentTime(), 0.0, 0.001, 'Seeking before audio start clamps audio currentTime to 0.0s safely');

  // -------------------------------------------------------------
  // Test 8: Course Switching Resilience
  // -------------------------------------------------------------
  console.log('\n--- 8. Multi-Course Switching Synchronization ---');
  // Switch to Normal course (CourseKey: 1)
  const normalCourse = chart.courses[1];
  assert(normalCourse !== undefined, 'Normal course exists in chart');
  const normalTimeline = new Timeline(normalCourse);
  const normalLayout = calculateTimelineLayout(normalCourse, 1.0);

  assert(normalCourse.measures.length === 2, 'Normal course has 2 measures');
  const normalM0 = normalTimeline.getMeasureAtTime(0.0);
  assert(normalM0 !== null && normalM0.index === 0, 'Measure 0 retrieved in Normal course');

  const normalX = timeToTimelineX(1.0, normalTimeline, normalLayout);
  assert(normalX > 0, 'Normal course layout generates valid playhead coordinate');
  const normalRoundTrip = timelineXToTime(normalX, normalTimeline, normalLayout);
  assertClose(normalRoundTrip, 1.0, 0.005, 'Normal course preserves round-trip synchronization');

  // -------------------------------------------------------------
  // Test 9: Audio Completion & Playback State Transitions
  // -------------------------------------------------------------
  console.log('\n--- 9. Playback State & Completion Handling ---');
  await engine.play();
  assert(engine.getState().isPlaying === true, 'Engine playing state is true after play()');

  // Seeking while playing keeps engine playing
  engine.seek(15.0);
  assert(engine.getState().isPlaying === true, 'Seeking while playing does NOT pause playback');
  assertClose(engine.getCurrentTime(), 15.0, 0.001, 'Audio jumped to 15.0s');

  // Pause
  engine.pause();
  assert(engine.getState().isPlaying === false, 'Engine playing state is false after pause()');

  // Seeking while paused remains paused
  engine.seek(25.0);
  assert(engine.getState().isPlaying === false, 'Seeking while paused does NOT unexpectedly trigger playback');
  assertClose(engine.getCurrentTime(), 25.0, 0.001, 'Audio jumped to 25.0s while paused');

  // Engine cleanup
  engine.destroy();
  assert(engine.getState().loadState === 'unloaded', 'Engine destroyed cleanly and released resources');

  // -------------------------------------------------------------
  // Test 10: Direct (X -> Time -> X) Round-Trip Symmetry
  // -------------------------------------------------------------
  console.log('\n--- 10. Direct X -> Time -> X Round-Trip Symmetry ---');
  const sampleXCoordinates = [
    layout100.measures[0].startX,
    layout100.measures[0].startX + layout100.measures[0].width * 0.25,
    layout100.measures[0].startX + layout100.measures[0].width * 0.5,
    layout100.measures[1].startX,
    layout100.measures[1].startX + layout100.measures[1].width * 0.75,
    layout100.measures[2].startX,
    layout100.measures[2].startX + layout100.measures[2].width * 0.5,
  ];

  for (const origX of sampleXCoordinates) {
    const timeFromX = timelineXToTime(origX, timeline, layout100);
    const roundTripX = timeToTimelineX(timeFromX, timeline, layout100);
    assertClose(roundTripX, origX, 0.5, `X -> Time -> X preserved at X=${origX.toFixed(1)}px (roundtrip: ${roundTripX.toFixed(1)}px)`);
  }

  // -------------------------------------------------------------
  // Test 11: Extreme #MEASURE (99999999/1) Safety Guard
  // -------------------------------------------------------------
  console.log('\n--- 11. Extreme #MEASURE (99999999/1) Safety ---');
  const extremeMeasureTja = `
TITLE:Extreme Measure Test
BPM:120
#START
#MEASURE 99999999/1
1,
#MEASURE 4/4
1020,
#END`;
  const extremeChart = parseTJA(extremeMeasureTja);
  const extremeCourse = extremeChart.courses[3];
  assert(extremeCourse !== undefined, 'Extreme course parsed successfully');
  assert(extremeCourse.measures.length === 2, 'Extreme course parsed 2 measures without infinite loops');

  const extremeTimeline = new Timeline(extremeCourse);
  const extremeLayout = calculateTimelineLayout(extremeCourse, 100);

  // Verify visual width is clamped safely to MAX_MEASURE_WIDTH
  assert(extremeLayout.measures[0].width <= 8000, `Measure 0 width is clamped safely (${extremeLayout.measures[0].width}px <= 8000px)`);
  assert(isFinite(extremeLayout.measures[0].width), 'Measure 0 width is finite');

  // Verify time mapping operates algebraically without freezing
  const extremeTime = 10.0;
  const extremeX = timeToTimelineX(extremeTime, extremeTimeline, extremeLayout);
  assert(isFinite(extremeX), 'timeToTimelineX produces finite X for extreme measure');
  const extremeTimeBack = timelineXToTime(extremeX, extremeTimeline, extremeLayout);
  assert(isFinite(extremeTimeBack), 'timelineXToTime produces finite time for extreme measure');

  // -------------------------------------------------------------
  // Test 12: Audio Longer than Chart (Extrapolation & Layout Expansion)
  // -------------------------------------------------------------
  console.log('\n--- 12. Audio Longer than Chart Handling ---');
  const chartEnd = activeCourse.measures[activeCourse.measures.length - 1].startTime +
    activeCourse.measures[activeCourse.measures.length - 1].duration; // 6.25s
  const longAudioDuration = 60.0; // Audio is 60s, chart is 6.25s

  const expandedLayout = calculateTimelineLayout(activeCourse, 100, { minDuration: longAudioDuration });
  assert(expandedLayout.totalWidth > layout100.totalWidth, 'calculateTimelineLayout expands totalWidth when audio extends beyond chart');

  // Time beyond chart extrapolates smoothly without NaN or errors
  const beyondChartTime = 15.0; // 8.75s beyond chart end
  const beyondChartX = timeToTimelineX(beyondChartTime, timeline, expandedLayout);
  const lastMeasureEndX = expandedLayout.measures[expandedLayout.measures.length - 1].endX;
  assert(beyondChartX > lastMeasureEndX, 'timeToTimelineX extrapolates beyond last measure endX');

  const reconBeyondTime = timelineXToTime(beyondChartX, timeline, expandedLayout);
  assertClose(reconBeyondTime, beyondChartTime, 0.01, 'timelineXToTime accurately converts extrapolated X back to time');

  // -------------------------------------------------------------
  // Test 13: Boundary & Clamp Handling (Negative Time / Left Margin)
  // -------------------------------------------------------------
  console.log('\n--- 13. Boundary & Clamp Handling ---');
  const negTime = -2.5;
  const clampedX = timeToTimelineX(negTime, timeline, layout100);
  assert(clampedX === layout100.measures[0].startX, 'Negative time clamps strictly to Measure 0 startX');

  const beforeStartX = layout100.measures[0].startX - 30;
  const clampedTime = timelineXToTime(beforeStartX, timeline, layout100);
  assert(clampedTime === 0.0, 'X before startX clamps strictly to time 0.0s');

  // -------------------------------------------------------------
  // Test 14: Audio Ended Event & Replay Handling
  // -------------------------------------------------------------
  console.log('\n--- 14. Audio Ended & Replay Handling ---');
  const replayEngine = new AudioEngine();
  const replayFile = { name: 'replay-test.mp3', size: 1024 } as any;
  await replayEngine.loadAudioFile(replayFile);
  await replayEngine.play();
  assert(replayEngine.getState().isPlaying === true, 'Replay engine is playing');

  // Simulate audio ended event from browser
  const mockAudio = (replayEngine as any).audio as MockAudioElement;
  mockAudio.currentTime = replayEngine.getDuration();
  mockAudio.dispatchEvent('ended');

  assert(replayEngine.getState().isPlaying === false, 'Engine isPlaying becomes false on ended event');
  assertClose(replayEngine.getCurrentTime(), replayEngine.getDuration(), 0.001, 'currentTime equals duration on ended');

  // Triggering play() again should reset to 0 and resume cleanly
  await replayEngine.play();
  assert(replayEngine.getState().isPlaying === true, 'Engine successfully replays after ended');
  assertClose(replayEngine.getCurrentTime(), 0.0, 0.05, 'Playback restarts from beginning (0.0s)');

  replayEngine.destroy();
  assert(replayEngine.getState().loadState === 'unloaded', 'Replay engine cleanly destroyed');

  console.log(`\n==================================================`);
  console.log(`Phase 4-2 Verification Complete: ${passedTests} / ${totalTests} tests passed.`);
  console.log(`🎉 ALL PHASE 4-2 SPECIFICATION REQUIREMENTS VERIFIED!`);
  console.log(`==================================================\n`);
}

runPhase42SyncTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
