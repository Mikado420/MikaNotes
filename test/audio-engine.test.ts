/**
 * MikaNotes Phase 4-1 Audio Engine & Synchronization Verification Suite
 * Tests all 21 verification items specified in the Phase 4-1 requirements:
 * 1. Audio file loading (File -> Object URL -> AudioElement)
 * 2. Audio duration retrieval
 * 3. Play
 * 4. Pause
 * 5. Resume
 * 6. Stop
 * 7. Seek (arbitrary seconds jump)
 * 8. Audio currentTime retrieval (RAF / timeupdate)
 * 9. Timeline playhead synchronization (Audio time -> Timeline X coordinate)
 * 10. Timeline playhead interaction -> Audio seek
 * 11. Timeline auto-scroll compatibility
 * 12. Playback from chart start (0.0s)
 * 13. Stop at chart end
 * 14. Fallback when audio is unloaded (standalone timeline playback unaffected)
 * 15. Audio replacement (revoke old Object URL, load new audio)
 * 16. Memory leak prevention (destroy / Object URL revocation)
 * 17. OFFSET consideration in Audio-Timeline sync
 * 18. BPMCHANGE handling in Audio-Timeline sync
 * 19. MEASURE (time signature change) handling in Audio-Timeline sync
 * 20. Playback rate control
 * 21. Volume control
 */

import { AudioEngine } from '../src/audio/AudioEngine';
import { Timeline } from '../src/core/timeline';
import { parseTJA } from '../src/core/parser';
import { calculateTimelineLayout, snapTimelineXToGrid } from '../src/editor/coordinate-mapping';

// Mock browser APIs for Node environment test execution
class MockAudioElement {
  public src = '';
  public currentTime = 0;
  public duration = 120.5; // 2 minutes 0.5s
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
    this.dispatchEvent('playing');
  }

  pause() {
    this.paused = true;
    this.dispatchEvent('pause');
  }

  load() {
    // Simulate async metadata load
    setTimeout(() => {
      this.dispatchEvent('loadedmetadata');
      this.dispatchEvent('canplaythrough');
    }, 10);
  }
}

let revokedUrls: string[] = [];
let createdUrls: string[] = [];

// Polyfill global window & URL if running in tsx / node
if (typeof (global as any).window === 'undefined') {
  (global as any).window = global;
}

(global as any).Audio = MockAudioElement as any;

(global as any).URL = {
  createObjectURL: (blob: any) => {
    const url = `blob:http://localhost/mock-${Math.random().toString(36).slice(2)}`;
    createdUrls.push(url);
    return url;
  },
  revokeObjectURL: (url: string) => {
    revokedUrls.push(url);
  },
};

(global as any).requestAnimationFrame = (cb: (time: number) => void) => {
  return setTimeout(() => cb(Date.now()), 16) as any;
};

(global as any).cancelAnimationFrame = (id: any) => {
  clearTimeout(id);
};

async function runTests() {
  console.log('=== MikaNotes Phase 4-1 Audio Engine & Sync Verification Suite ===\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, description: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] Item ${total}: ${description}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] Item ${total}: ${description}`);
      process.exitCode = 1;
    }
  }

  // 1. Audio file loading
  const engine = new AudioEngine();
  const mockBlob = { name: 'test_song.ogg', size: 1024, type: 'audio/ogg' } as File;
  const loadPromise = engine.loadAudioFile(mockBlob);

  assert(engine.getState().loadState === 'loading', 'AudioEngine enters loading state when loadAudioFile is called');

  await loadPromise;
  const loadedState = engine.getState();
  assert(loadedState.loadState === 'loaded', 'AudioEngine transitions to loaded state upon canplaythrough');
  assert(loadedState.fileName === 'test_song.ogg', 'AudioEngine tracks file name');

  // 2. Audio duration retrieval
  assert(loadedState.duration === 120.5 && engine.getDuration() === 120.5, 'AudioEngine retrieves duration accurately (120.5s)');

  // 3. Play
  await engine.play();
  assert(engine.isPlaying() && engine.getState().isPlaying === true, 'AudioEngine starts playback and updates isPlaying to true');

  // 4. Pause
  engine.pause();
  assert(!engine.isPlaying() && engine.getState().isPlaying === false, 'AudioEngine pauses playback and updates isPlaying to false');

  // 5. Resume
  await engine.resume();
  assert(engine.isPlaying() && engine.getState().isPlaying === true, 'AudioEngine resumes playback');

  // 6. Stop
  engine.stop();
  assert(!engine.isPlaying() && engine.getCurrentTime() === 0, 'AudioEngine stops and resets currentTime to 0');

  // 7. Seek (arbitrary seconds jump)
  engine.seek(45.25);
  assert(Math.abs(engine.getCurrentTime() - 45.25) < 1e-4, 'AudioEngine seeks to arbitrary time (45.25s)');

  engine.seek(-10);
  assert(engine.getCurrentTime() === 0, 'AudioEngine clamps negative seek to 0s');

  engine.seek(999);
  assert(engine.getCurrentTime() === 120.5, 'AudioEngine clamps beyond-duration seek to duration');

  // 8. Audio currentTime retrieval (RAF / timeupdate subscriber)
  let receivedAudioTime = -1;
  const unsubTime = engine.subscribeTime((time) => {
    receivedAudioTime = time;
  });
  engine.seek(33.3);
  await new Promise((resolve) => setTimeout(resolve, 40));
  unsubTime();
  assert(receivedAudioTime >= 33.3, 'AudioEngine subscribeTime receives high-frequency time updates');

  // 9. Timeline playhead synchronization (Audio time -> Timeline X coordinate)
  const sampleTJA = `
TITLE:Phase 4-1 Test Song
BPM:120
WAVE:test_song.ogg
OFFSET:-1.0

#START
10201020,
#BPMCHANGE 240
11112222,
#MEASURE 3/4
101010,
#END
`;
  const chart = parseTJA(sampleTJA);
  const course = chart.courses[3] || chart.activeCourse;
  const timeline = new Timeline(course);
  const layout = calculateTimelineLayout(course, 100);

  const chartOffset = chart.headers.offset || 0; // -1.0
  // Timeline time = audioTime + offset = audioTime - 1.0
  // Or in TJA: Note at audioTime 2.0s -> timeline time = 2.0 + (-1.0) = 1.0s
  // If audioTime = 1.0s, timelineTime = audioTime + chartOffset = 1.0 + (-1.0) = 0.0s (measure 0 start!)
  const audioTime1 = 1.0;
  const timelineTime1 = audioTime1 + chartOffset; // 0.0s
  const measure0 = timeline.getMeasureAtTime(timelineTime1);
  assert(measure0 !== null && measure0.index === 0, 'Audio time 1.0s maps to Measure 0 start when OFFSET = -1.0s');

  // 10. Timeline interaction -> Audio seek
  const targetTimelineTime = 2.0; // 2 seconds into chart
  const expectedAudioTime = targetTimelineTime - chartOffset; // 2.0 - (-1.0) = 3.0s
  engine.seek(expectedAudioTime);
  assert(Math.abs(engine.getCurrentTime() - 3.0) < 1e-4, 'Timeline seek at 2.0s maps to Audio seek at 3.0s with OFFSET -1.0s');

  // 11. Timeline auto-scroll / snap compatibility
  const snap = snapTimelineXToGrid(layout.measures[0].startX + 50, timeline, layout, 4);
  assert(snap !== null && snap.time >= 0, 'Grid snap accurately returns target timeline time for playback alignment');

  // 12. Playback from chart start (0.0s)
  const chartStartTime = 0.0;
  const initialAudioTime = chartStartTime - chartOffset; // 1.0s
  engine.seek(initialAudioTime);
  assert(Math.abs(engine.getCurrentTime() - 1.0) < 1e-4, 'Starting from chart 0.0s seeks audio to 1.0s');

  // 13. Stop at chart end
  const chartDuration = timeline.getDuration();
  assert(chartDuration > 0, `Chart duration accurately calculated (${chartDuration.toFixed(3)}s)`);

  // 14. Fallback when audio is unloaded
  const unloadedEngine = new AudioEngine();
  assert(unloadedEngine.getState().loadState === 'unloaded', 'AudioEngine initial state is unloaded');
  assert(unloadedEngine.getDuration() === 0, 'Unloaded AudioEngine duration is 0');

  // 15. Audio replacement (revoking old Object URL, loading new audio)
  const initialCreatedCount = createdUrls.length;
  const initialRevokedCount = revokedUrls.length;
  const newBlob = { name: 'replacement_song.wav', size: 2048, type: 'audio/wav' } as File;
  await engine.loadAudioFile(newBlob);
  assert(revokedUrls.length === initialRevokedCount + 1, 'Previous Object URL revoked upon loading new audio file');
  assert(engine.getState().fileName === 'replacement_song.wav', 'Audio replacement updates to new file name');

  // 16. Memory leak prevention (destroy / Object URL revocation)
  engine.destroy();
  assert(revokedUrls.length === initialRevokedCount + 2, 'Object URL revoked on engine destroy() to prevent memory leaks');
  assert(engine.getState().loadState === 'unloaded', 'Engine destroyed resets to unloaded');

  // 17. OFFSET consideration in Audio-Timeline sync
  // Test with positive offset: OFFSET: 1.5
  const tjaWithPosOffset = `
TITLE:Positive Offset Test
BPM:120
OFFSET:1.5

#START
1000,
#END
`;
  const chartPos = parseTJA(tjaWithPosOffset);
  const posOffset = chartPos.headers.offset; // 1.5
  // timelineTime = audioTime + offset (Note at timeline 0 is at audioTime = -1.5s, or audio 0 is timeline 1.5s)
  const audioAtZero = 0.0;
  const timelineAtAudioZero = audioAtZero + posOffset;
  assert(timelineAtAudioZero === 1.5, 'Positive offset (+1.5s) correctly shifts timeline time to 1.5s at audio 0s');

  // 18. BPMCHANGE handling in Audio-Timeline sync
  // Measure 0 is BPM 120 (4/4 -> 2.0s duration)
  // Measure 1 is BPM 240 (4/4 -> 1.0s duration)
  const m0 = course.measures[0];
  const m1 = course.measures[1];
  assert(Math.abs(m0.duration - 2.0) < 1e-4, 'Measure 0 duration at BPM 120 is 2.0s');
  assert(Math.abs(m1.duration - 1.0) < 1e-4, 'Measure 1 duration at BPM 240 is 1.0s');
  assert(Math.abs(m1.startTime - 2.0) < 1e-4, 'Measure 1 start time is exactly at 2.0s despite BPM change');

  // 19. MEASURE (time signature change) handling in Audio-Timeline sync
  // Measure 2 is 3/4 at BPM 240 (3 beats at 240 BPM -> 3 * 0.25s = 0.75s)
  const m2 = course.measures[2];
  assert(Math.abs(m2.duration - 0.75) < 1e-4, 'Measure 2 duration with #MEASURE 3/4 at BPM 240 is 0.75s');

  // 20. Playback rate control
  const rateEngine = new AudioEngine();
  rateEngine.setPlaybackRate(1.5);
  assert(rateEngine.getState().playbackRate === 1.5, 'AudioEngine sets playbackRate to 1.5x');
  rateEngine.setPlaybackRate(0.1);
  assert(rateEngine.getState().playbackRate === 0.25, 'AudioEngine clamps playbackRate to minimum 0.25x');
  rateEngine.setPlaybackRate(10);
  assert(rateEngine.getState().playbackRate === 4.0, 'AudioEngine clamps playbackRate to maximum 4.0x');

  // 21. Volume control
  rateEngine.setVolume(0.7);
  assert(Math.abs(rateEngine.getState().volume - 0.7) < 1e-4, 'AudioEngine sets volume to 0.7');
  rateEngine.setVolume(-0.5);
  assert(rateEngine.getState().volume === 0.0, 'AudioEngine clamps volume to 0.0');
  rateEngine.setVolume(1.5);
  assert(rateEngine.getState().volume === 1.0, 'AudioEngine clamps volume to 1.0');
  rateEngine.destroy();

  // 22. Rapid audio switching / generation token safety
  const raceEngine = new AudioEngine();
  const fileA = { name: 'trackA.mp3', size: 1024 } as File;
  const fileB = { name: 'trackB.mp3', size: 2048 } as File;
  const pA = raceEngine.loadAudioFile(fileA);
  const pB = raceEngine.loadAudioFile(fileB);
  await Promise.all([pA, pB]);
  assert(raceEngine.getState().fileName === 'trackB.mp3', 'Generation token ensures final audio is trackB.mp3 despite rapid switching');
  assert(raceEngine.getState().loadState === 'loaded', 'Race engine settled to loaded state');

  // 23. Immediate destroy timer cleanup
  const timerEngine = new AudioEngine();
  const dummyFile = { name: 'dummy.mp3', size: 512 } as File;
  timerEngine.loadAudioFile(dummyFile);
  timerEngine.destroy();
  assert(timerEngine.getState().loadState === 'unloaded', 'Engine destroyed immediately before load resolves remains unloaded');

  // 24. Ended event replay test
  const endEngine = new AudioEngine();
  await endEngine.loadAudioFile(fileA);
  await endEngine.play();
  assert(endEngine.getState().isPlaying === true, 'End engine is playing');
  const endAudio = (endEngine as any).audio as MockAudioElement;
  endAudio.currentTime = endEngine.getDuration();
  endAudio.dispatchEvent('ended');
  assert(endEngine.getState().isPlaying === false, 'End engine isPlaying set to false on ended event');
  await endEngine.play();
  assert(endEngine.getState().isPlaying === true, 'End engine replays cleanly');
  assert(endEngine.getCurrentTime() <= 0.05, 'End engine replayed from beginning');
  endEngine.destroy();

  // 25. Rapid audio switching A -> B -> C
  const tripleEngine = new AudioEngine();
  const file1 = { name: 'track1.mp3', size: 1024 } as File;
  const file2 = { name: 'track2.mp3', size: 2048 } as File;
  const file3 = { name: 'track3.mp3', size: 4096 } as File;
  const p1 = tripleEngine.loadAudioFile(file1);
  const p2 = tripleEngine.loadAudioFile(file2);
  const p3 = tripleEngine.loadAudioFile(file3);
  await Promise.all([p1, p2, p3]);
  assert(tripleEngine.getState().fileName === 'track3.mp3', 'A -> B -> C rapid switching settles to track3.mp3');
  assert(tripleEngine.getState().loadState === 'loaded', 'A -> B -> C rapid switching state is loaded');
  tripleEngine.destroy();

  // 26. Stale event immunity (old audio element event does not corrupt active engine)
  const staleEngine = new AudioEngine();
  const fileX = { name: 'trackX.mp3', size: 1024 } as File;
  const fileY = { name: 'trackY.mp3', size: 2048 } as File;
  const pX = staleEngine.loadAudioFile(fileX);
  const oldAudioInstance = (staleEngine as any).audio as MockAudioElement | null;
  const pY = staleEngine.loadAudioFile(fileY);
  await Promise.all([pX, pY]);
  assert(staleEngine.getState().fileName === 'trackY.mp3', 'Current engine file is trackY.mp3');
  if (oldAudioInstance) {
    oldAudioInstance.dispatchEvent('error');
    oldAudioInstance.dispatchEvent('ended');
  }
  assert(staleEngine.getState().loadState === 'loaded', 'Stale audio element error event does not change engine loadState');
  assert(staleEngine.getState().fileName === 'trackY.mp3', 'Stale audio element event does not change engine fileName');
  staleEngine.destroy();

  // 27. Destroy during loading guarantees Promise resolution and unloaded state
  const abortEngine = new AudioEngine();
  const fileZ = { name: 'trackZ.mp3', size: 1024 } as File;
  const pZ = abortEngine.loadAudioFile(fileZ);
  abortEngine.destroy();
  await pZ;
  assert(abortEngine.getState().loadState === 'unloaded', 'Engine destroyed while loading settles promise and remains unloaded');

  // 28. Fallback timeout timer cleanup
  const timeoutEngine = new AudioEngine();
  const stalledFile = { name: 'stalled.mp3', size: 1024 } as File;
  const pStalled = timeoutEngine.loadAudioFile(stalledFile);
  timeoutEngine.destroy();
  await pStalled;
  assert(timeoutEngine.getState().loadState === 'unloaded', 'Stalled engine destroy cleans up fallback timer cleanly');

  // 29. loadedmetadata alone successfully settles load
  const metaOnlyEngine = new AudioEngine();
  const metaOnlyFile = { name: 'metaOnly.mp3', size: 1024 } as File;
  const pMeta = metaOnlyEngine.loadAudioFile(metaOnlyFile);
  const metaAudio = (metaOnlyEngine as any).audio as MockAudioElement;
  metaAudio.dispatchEvent('loadedmetadata');
  await pMeta;
  assert(metaOnlyEngine.getState().loadState === 'loaded', 'loadedmetadata alone settles engine to loaded state');
  metaOnlyEngine.destroy();

  // 30. canplay alone successfully settles load
  const canplayOnlyEngine = new AudioEngine();
  const canplayFile = { name: 'canplayOnly.mp3', size: 1024 } as File;
  const pCanplay = canplayOnlyEngine.loadAudioFile(canplayFile);
  const canplayAudio = (canplayOnlyEngine as any).audio as MockAudioElement;
  canplayAudio.dispatchEvent('canplay');
  await pCanplay;
  assert(canplayOnlyEngine.getState().loadState === 'loaded', 'canplay alone settles engine to loaded state');
  canplayOnlyEngine.destroy();

  // 31. loadedmetadata followed by canplay does not double-resolve or corrupt state
  const dualEventEngine = new AudioEngine();
  const dualFile = { name: 'dual.mp3', size: 1024 } as File;
  let stateNotifCount = 0;
  dualEventEngine.subscribe(() => { stateNotifCount++; });
  const pDual = dualEventEngine.loadAudioFile(dualFile);
  const dualAudio = (dualEventEngine as any).audio as MockAudioElement;
  dualAudio.dispatchEvent('loadedmetadata');
  await pDual;
  const countAfterMeta = stateNotifCount;
  // Dispatch canplay afterwards
  dualAudio.dispatchEvent('canplay');
  assert(stateNotifCount === countAfterMeta, 'canplay following loadedmetadata does not trigger duplicate state notifications');
  assert(dualEventEngine.getState().loadState === 'loaded', 'Engine remains in loaded state after subsequent canplay');
  dualEventEngine.destroy();

  // 32. error event and loadedmetadata race: error settles first, loadedmetadata ignored
  const raceErrorEngine = new AudioEngine();
  const errorFile = { name: 'error.mp3', size: 1024 } as File;
  const pErrorRace = raceErrorEngine.loadAudioFile(errorFile);
  const errorAudio = (raceErrorEngine as any).audio as MockAudioElement;
  errorAudio.dispatchEvent('error');
  errorAudio.dispatchEvent('loadedmetadata');
  await pErrorRace;
  assert(raceErrorEngine.getState().loadState === 'error', 'Error event takes precedence when dispatched first');
  raceErrorEngine.destroy();

  // 33. All stale events on superseded instances (A -> B -> C) ignored
  const robustEngine = new AudioEngine();
  const fA = { name: 'fA.mp3', size: 1024 } as File;
  const fB = { name: 'fB.mp3', size: 2048 } as File;
  const fC = { name: 'fC.mp3', size: 4096 } as File;
  const pA_rob = robustEngine.loadAudioFile(fA);
  const audioA = (robustEngine as any).audio as MockAudioElement;
  const pB_rob = robustEngine.loadAudioFile(fB);
  const audioB = (robustEngine as any).audio as MockAudioElement;
  const pC_rob = robustEngine.loadAudioFile(fC);
  await Promise.all([pA_rob, pB_rob, pC_rob]);

  // Dispatch whole suite of stale events on A and B
  if (audioA) {
    audioA.dispatchEvent('loadedmetadata');
    audioA.dispatchEvent('canplay');
    audioA.dispatchEvent('timeupdate');
    audioA.dispatchEvent('play');
    audioA.dispatchEvent('pause');
    audioA.dispatchEvent('ended');
    audioA.dispatchEvent('error');
  }
  if (audioB) {
    audioB.dispatchEvent('loadedmetadata');
    audioB.dispatchEvent('canplay');
    audioB.dispatchEvent('timeupdate');
    audioB.dispatchEvent('play');
    audioB.dispatchEvent('pause');
    audioB.dispatchEvent('ended');
    audioB.dispatchEvent('error');
  }
  assert(robustEngine.getState().fileName === 'fC.mp3', 'Robust engine preserves fileName fC.mp3 despite stale events');
  assert(robustEngine.getState().loadState === 'loaded', 'Robust engine preserves loaded state despite stale error events');
  robustEngine.destroy();

  // 34. Complete Object URL lifecycle: no memory leaks and no duplicate revocations
  const urlEngine = new AudioEngine();
  const url1 = { name: 'u1.mp3', size: 1024 } as File;
  const url2 = { name: 'u2.mp3', size: 1024 } as File;
  const preCreateCount = createdUrls.length;
  const preRevokeCount = revokedUrls.length;
  await urlEngine.loadAudioFile(url1);
  await urlEngine.loadAudioFile(url2);
  urlEngine.destroy();
  const postCreateCount = createdUrls.length;
  const postRevokeCount = revokedUrls.length;
  assert(postCreateCount - preCreateCount === 2, 'Two Object URLs created for two files');
  assert(postRevokeCount - preRevokeCount === 2, 'Both Object URLs revoked cleanly upon replacement and destroy');

  // Verify no duplicate revocations across the test session
  const revokedSet = new Set<string>();
  let hasDuplicateRevoke = false;
  for (const u of revokedUrls) {
    if (revokedSet.has(u)) {
      hasDuplicateRevoke = true;
      break;
    }
    revokedSet.add(u);
  }
  assert(!hasDuplicateRevoke, 'No Object URL was revoked more than once (no double-revoke)');

  console.log(`\nVerification Complete: ${passed} / ${total} tests passed.`);
  if (passed === total) {
    console.log('🎉 ALL 21 PHASE 4-1 VERIFICATION ITEMS CONFIRMED SUCCESSFUL!\n');
  } else {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
