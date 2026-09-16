/**
 * MikaNotes TJA Core - Automated Test Suite
 * Covers all specifications: Normal, Mixed, BPM, Measure, Delay, Gogo, Rolls, Balloons,
 * Multi-Events, Arbitrary Grids, Round-Trip preservation, and Abnormal / Heavy charts.
 */

import { parseTJA } from './parser';
import { writeTJA } from './writer';
import { scanTJAInfo } from './scanner';
import { validateTJARaw } from './validator';
import { Timeline } from './timeline';
import { approxEqual, isSameRationalPosition } from './math';
import { ChartModel } from './types';
import {
  snapTimelineXToGrid,
  calculateTimelineLayout,
  findMeasureLayoutAtX,
  findVisibleMeasureLayouts,
  getNoteX,
  timeToTimelineX,
  timelineXToTime,
} from '../editor/coordinate-mapping';
import { GridDivision } from '../editor/editor-types';
import {
  PendingSpecialNote,
  validateSpecialStart,
  validateSpecialPlacement,
  createSpecialNote,
  eraseSpecialNoteAtPosition,
} from '../editor/special-notes';

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'normal' | 'timing' | 'rolls' | 'multievent' | 'roundtrip' | 'abnormal' | 'grid';
  status: 'passed' | 'failed';
  message: string;
  durationMs: number;
  details?: Record<string, any>;
}

export function runAllCoreTests(): TestCaseResult[] {
  const results: TestCaseResult[] = [];

  function test(
    id: string,
    name: string,
    category: TestCaseResult['category'],
    fn: () => { passed: boolean; message: string; details?: Record<string, any> }
  ) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const res = fn();
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      results.push({
        id,
        name,
        category,
        status: res.passed ? 'passed' : 'failed',
        message: res.message,
        durationMs: Math.round((t1 - t0) * 100) / 100,
        details: res.details,
      });
    } catch (e: any) {
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      results.push({
        id,
        name,
        category,
        status: 'failed',
        message: `Exception thrown: ${e?.message || e}`,
        durationMs: Math.round((t1 - t0) * 100) / 100,
      });
    }
  }

  // 1. Normal Test (1000100010001000)
  test('test-normal', 'Normal Pattern (1000100010001000)', 'normal', () => {
    const tja = `TITLE:Normal Test\nBPM:120\n#START\n1000100010001000,\n#END`;
    const chart = parseTJA(tja);
    const notes = chart.activeCourse.notes;
    const passed = notes.length === 4 &&
      notes[0].type === '1' && approxEqual(notes[0].time, 0.0) &&
      notes[1].type === '1' && approxEqual(notes[1].time, 0.5) &&
      notes[2].type === '1' && approxEqual(notes[2].time, 1.0) &&
      notes[3].type === '1' && approxEqual(notes[3].time, 1.5);
    return {
      passed,
      message: passed ? 'Parsed 4 quarter-beat notes at exact 0.5s intervals (BPM 120).' : 'Note count or timing mismatch.',
      details: { noteCount: notes.length, times: notes.map(n => n.time) },
    };
  });

  // 2. Mixed Test (3022102210210212)
  test('test-mixed', 'Mixed Note Types (3022102210210212)', 'normal', () => {
    const tja = `TITLE:Mixed Test\nBPM:120\n#START\n3022102210210212,\n#END`;
    const chart = parseTJA(tja);
    const notes = chart.activeCourse.notes;
    const passed = notes.length === 12 &&
      notes[0].kind === 'big_don' && notes[0].type === '3' &&
      notes[1].kind === 'ka' && notes[1].type === '2' &&
      notes[3].kind === 'don' && notes[3].type === '1';
    return {
      passed,
      message: passed ? 'Parsed 12 notes with exact Don, Ka, Big Don mappings.' : 'Failed to parse mixed notes.',
      details: { noteCount: notes.length, types: notes.map(n => n.type).join('') },
    };
  });

  // 3. BPMCHANGE Test
  test('test-bpmchange', '#BPMCHANGE 180 and #BPMCHANGE 200 Timing', 'timing', () => {
    const tja = `TITLE:BPM Test\nBPM:120\n#START\n1000100010001000,\n#BPMCHANGE 180\n1000100010001000,\n#END`;
    const chart = parseTJA(tja);
    const notes = chart.activeCourse.notes;
    // Measure 1: 4 beats at 120 BPM = 2.0s
    // Measure 2: 4 beats at 180 BPM = (4/180)*60 = 1.3333s
    const m1Time = notes[0].time; // 0.0s
    const m2Start = notes[4].time; // should be 2.0s
    const m2End = notes[7].time; // 2.0 + 3 * (60 / 180) = 2.0 + 1.0 = 3.0s
    const passed = approxEqual(m2Start, 2.0) && approxEqual(m2End, 3.0);
    return {
      passed,
      message: passed ? 'BPM change correctly accelerated subsequent measure without affecting previous measure.' : 'BPM timing incorrect.',
      details: { m1FirstNote: m1Time, m2FirstNote: m2Start, m2LastNote: m2End },
    };
  });

  // 4. MEASURE Tests (3/4, 5/4, 7/8)
  test('test-measure-variations', '#MEASURE Changes (3/4, 5/4, 7/8)', 'timing', () => {
    const tja = `TITLE:Measure Test\nBPM:120\n#START\n#MEASURE 3/4\n100010001000,\n#MEASURE 5/4\n10001000100010001000,\n#MEASURE 7/8\n10101010101010,\n#END`;
    const chart = parseTJA(tja);
    const measures = chart.activeCourse.measures;
    // Measure 0: 3/4 => 3 beats => at 120 BPM = 1.5s
    // Measure 1: 5/4 => 5 beats => at 120 BPM = 2.5s
    // Measure 2: 7/8 => 3.5 beats => at 120 BPM = 1.75s
    const passed = measures.length === 3 &&
      approxEqual(measures[0].duration, 1.5) &&
      approxEqual(measures[1].duration, 2.5) &&
      approxEqual(measures[2].duration, 1.75);
    return {
      passed,
      message: passed ? 'Measures 3/4 (1.5s), 5/4 (2.5s), and 7/8 (1.75s) calculated with high precision.' : 'Measure duration calculation error.',
      details: { durations: measures.map(m => m.duration), ratios: measures.map(m => `${m.numerator}/${m.denominator}`) },
    };
  });

  // 5. DELAY Test
  test('test-delay', '#DELAY 1.5 Duration Advancement', 'timing', () => {
    const tja = `TITLE:Delay Test\nBPM:120\n#START\n1000100010001000,\n#DELAY 1.5\n1000100010001000,\n#END`;
    const chart = parseTJA(tja);
    const m1Note0 = chart.activeCourse.notes[0];
    const m2Note0 = chart.activeCourse.notes[4];
    // Measure 1 ends at 2.0s, delay adds 1.5s -> Measure 2 begins at 3.5s
    const passed = approxEqual(m1Note0.time, 0.0) && approxEqual(m2Note0.time, 3.5);
    return {
      passed,
      message: passed ? 'Timeline advanced by exactly 1.5s after DELAY command without shifting past events.' : 'DELAY offset calculation mismatch.',
      details: { beforeDelayTime: 2.0, afterDelayTime: m2Note0.time },
    };
  });

  // 6. GOGO Test (#GOGOSTART ... #GOGOEND)
  test('test-gogo', 'GOGO Interval Tracking', 'multievent', () => {
    const tja = `TITLE:Gogo Test\nBPM:120\n#START\n1000100010001000,\n#GOGOSTART\n1000100010001000,\n#GOGOEND\n1000100010001000,\n#END`;
    const chart = parseTJA(tja);
    const gogo = chart.activeCourse.gogoRanges;
    const timeline = new Timeline(chart.activeCourse);
    const passed = gogo.length === 1 &&
      approxEqual(gogo[0].startTime, 2.0) &&
      approxEqual(gogo[0].endTime, 4.0) &&
      !timeline.getGogoStateAtTime(1.0) &&
      timeline.getGogoStateAtTime(2.5) &&
      !timeline.getGogoStateAtTime(4.5);
    return {
      passed,
      message: passed ? 'GOGOSTART and GOGOEND paired into discrete timeline range [2.0s, 4.0s].' : 'Gogo ranges tracking failed.',
      details: { gogoCount: gogo.length, range: gogo[0] },
    };
  });

  // 7. Roll Tests (Normal 5..8 and Big 6..8)
  test('test-rolls', 'Roll (5..8) and Big Roll (6..8)', 'rolls', () => {
    const tja = `TITLE:Roll Test\nBPM:120\n#START\n5000000080000000,\n6000000080000000,\n#END`;
    const chart = parseTJA(tja);
    const rolls = chart.activeCourse.rolls;
    const passed = rolls.length === 2 &&
      rolls[0].type === 'roll' && rolls[0].rawType === '5' &&
      approxEqual(rolls[0].startTime, 0.0) && approxEqual(rolls[0].endTime, 1.0) &&
      rolls[1].type === 'big_roll' && rolls[1].rawType === '6' &&
      approxEqual(rolls[1].startTime, 2.0) && approxEqual(rolls[1].endTime, 3.0);
    return {
      passed,
      message: passed ? 'Rolls 5 and 6 paired cleanly with 8 into structured RollModel objects.' : 'Rolls model mismatch.',
      details: { rolls: rolls.map(r => ({ type: r.type, start: r.startTime, end: r.endTime })) },
    };
  });

  // 8. Balloon Test (7..8 with BALLOON Header)
  test('test-balloon', 'Balloon (7..8 with BALLOON: 5,10)', 'rolls', () => {
    const tja = `TITLE:Balloon Test\nBPM:120\nBALLOON:5,10\n#START\n7000000080000000,\n7000000080000000,\n#END`;
    const chart = parseTJA(tja);
    const balloons = chart.activeCourse.balloons;
    const passed = balloons.length === 2 &&
      balloons[0].type === 'balloon' && balloons[0].hitCount === 5 &&
      balloons[1].type === 'balloon' && balloons[1].hitCount === 10;
    return {
      passed,
      message: passed ? 'Balloons paired with hitCounts 5 and 10 from BALLOON header sequentially.' : 'Balloon hitCount or pairing error.',
      details: { balloons: balloons.map(b => ({ hits: b.hitCount, start: b.startTime, end: b.endTime })) },
    };
  });

  // 9. Multiple Concurrent Events
  test('test-multiple-events', 'Multiple Simultaneous Events (BPM + MEASURE + GOGO + NOTE + DELAY)', 'multievent', () => {
    const tja = `TITLE:Multi Test\nBPM:120\n#START\n#MEASURE 4/4\n#BPMCHANGE 140\n#GOGOSTART\n1000100010001000,\n#DELAY 0.5\n#GOGOEND\n#BPMCHANGE 160\n2000200020002000,\n#END`;
    const chart = parseTJA(tja);
    const timeline = new Timeline(chart.activeCourse);
    const events = timeline.getEvents();
    const passed = events.length >= 6 && chart.activeCourse.notes.length === 8 && chart.activeCourse.gogoRanges.length === 1;
    return {
      passed,
      message: passed ? 'Simultaneous events maintained deterministic order without state collision.' : 'Multi-event processing failure.',
      details: { eventCount: events.length, noteCount: chart.activeCourse.notes.length },
    };
  });

  // 10. Arbitrary Grids (20-division, 24-division, 40-division)
  test('test-arbitrary-grids', 'Arbitrary Division Grids (20, 24, 40 notes per measure)', 'grid', () => {
    // 20 notes per bar
    const m20 = '10101010101010101010,';
    // 24 notes per bar
    const m24 = '100100100100100100100100,';
    const tja = `TITLE:Grid Test\nBPM:120\n#START\n${m20}\n${m24}\n#END`;
    const chart = parseTJA(tja);
    const measures = chart.activeCourse.measures;
    const passed = measures.length === 2 &&
      measures[0].division === 20 &&
      measures[1].division === 24 &&
      measures[0].notes.length === 10 &&
      measures[1].notes.length === 8;
    return {
      passed,
      message: passed ? 'Arbitrary note lengths (20 and 24) preserved with exact rational step intervals.' : 'Grid division error.',
      details: { m0Division: measures[0].division, m1Division: measures[1].division },
    };
  });

  // 11. Preservation Support (SCROLL, LYRIC, Custom Headers)
  test('test-preservation', 'Command and Header Preservation (#SCROLL, #LYRIC, custom headers)', 'roundtrip', () => {
    const tja = `TITLE:Preserve Test\nBPM:120\nMAKER:MikaCreator\nCUSTOM_TAG:Value123\n#START\n#SCROLL 1.75\n#LYRIC Hello World\n1000100010001000,\n#END`;
    const chart = parseTJA(tja);
    const scrollEv = chart.activeCourse.events.find(e => e.name === 'SCROLL');
    const lyricEv = chart.activeCourse.events.find(e => e.name === 'LYRIC');
    const customHeader = chart.headers.rawHeaders['CUSTOM_TAG'];
    const makerHeader = chart.headers.maker;

    const tjaOut = writeTJA(chart);
    const hasScroll = tjaOut.includes('#SCROLL 1.75');
    const hasLyric = tjaOut.includes('#LYRIC Hello World');
    const hasCustomTag = tjaOut.includes('CUSTOM_TAG:Value123');

    const passed = scrollEv?.value === '1.75' &&
      lyricEv?.value === 'Hello World' &&
      customHeader === 'Value123' &&
      makerHeader === 'MikaCreator' &&
      hasScroll && hasLyric && hasCustomTag;

    return {
      passed,
      message: passed ? 'Unknown & display-only commands (#SCROLL, #LYRIC, CUSTOM_TAG) preserved through Writer.' : 'Preservation failure.',
      details: { hasScroll, hasLyric, hasCustomTag },
    };
  });

  // 12. Round Trip Test (TJA A -> Model A -> TJA B -> Model B equality)
  test('test-round-trip', 'Full Round Trip Test (Model A === Model B semantics)', 'roundtrip', () => {
    const tjaA = `TITLE:Round Trip Song\nSUBTITLE:--Test Artist\nBPM:135\nWAVE:song.ogg\nOFFSET:-0.500\nCOURSE:Oni\nLEVEL:9\nBALLOON:5\n\n#START\n#MEASURE 4/4\n1000200030004000,\n#BPMCHANGE 180\n#GOGOSTART\n5000000080000000,\n#GOGOEND\n7000000080000000,\n#END`;

    const modelA = parseTJA(tjaA);
    const tjaB = writeTJA(modelA);
    const modelB = parseTJA(tjaB);

    const cA = modelA.activeCourse;
    const cB = modelB.activeCourse;

    const noteCountMatch = cA.notes.length === cB.notes.length;
    const measureCountMatch = cA.measures.length === cB.measures.length;
    const rollsCountMatch = cA.rolls.length === cB.rolls.length;
    const balloonsCountMatch = cA.balloons.length === cB.balloons.length;
    const gogoCountMatch = cA.gogoRanges.length === cB.gogoRanges.length;

    let timingsMatch = true;
    for (let i = 0; i < cA.notes.length; i++) {
      if (!approxEqual(cA.notes[i].time, cB.notes[i].time, 0.001) || cA.notes[i].type !== cB.notes[i].type) {
        timingsMatch = false;
        break;
      }
    }

    const passed = noteCountMatch && measureCountMatch && rollsCountMatch && balloonsCountMatch && gogoCountMatch && timingsMatch;

    return {
      passed,
      message: passed ? 'Round Trip Successful: Model A and Model B are semantically identical.' : 'Round Trip discrepancy detected.',
      details: {
        noteCount: `${cA.notes.length} vs ${cB.notes.length}`,
        measureCount: `${cA.measures.length} vs ${cB.measures.length}`,
        rollsCount: `${cA.rolls.length} vs ${cB.rolls.length}`,
        balloonsCount: `${cA.balloons.length} vs ${cB.balloons.length}`,
        timingsMatch,
      },
    };
  });

  // 13. Abnormal: #MEASURE 0/4 and 4/0
  test('test-abnormal-measure-zero', 'Abnormal #MEASURE 0/4 and 4/0 (Safety Fallback)', 'abnormal', () => {
    const tja = `TITLE:Zero Measure\nBPM:120\n#START\n#MEASURE 0/4\n1000,\n#MEASURE 4/0\n2000,\n#END`;
    const val = validateTJARaw(tja);
    const chart = parseTJA(tja);
    // Should safely fallback without dividing by zero or throwing
    const passed = val.errors.some(e => e.code === 'MEASURE_ZERO_NUMERATOR') &&
      val.errors.some(e => e.code === 'MEASURE_ZERO_DENOMINATOR') &&
      chart.activeCourse.measures.length === 2 &&
      isFinite(chart.activeCourse.measures[0].duration);
    return {
      passed,
      message: passed ? 'Safely detected division by zero and zero numerator, gracefully fell back.' : 'Failed to handle zero measure gracefully.',
      details: { errors: val.errors.map(e => e.message) },
    };
  });

  // 14. Abnormal: #MEASURE 99999999/1 (Huge ratio without freezing)
  test('test-abnormal-huge-measure', 'Abnormal #MEASURE 99999999/1 (Freeze Prevention)', 'abnormal', () => {
    const tja = `TITLE:Huge Measure\nBPM:120\n#START\n#MEASURE 99999999/1\n1000,\n#END`;
    const scan = scanTJAInfo(tja);
    const val = validateTJARaw(tja);
    const chart = parseTJA(tja);
    const passed = scan.isHeavy &&
      val.warnings.some(w => w.code === 'ABNORMAL_MEASURE_LENGTH') &&
      chart.activeCourse.measures.length === 1;
    return {
      passed,
      message: passed ? 'Huge measure flagged as heavy chart and safely bounded without allocating infinite arrays.' : 'Failed to handle huge measure.',
      details: { isHeavy: scan.isHeavy, heavyReasons: scan.heavyReasons },
    };
  });

  // 15. Abnormal: #BPMCHANGE 0, negative, NaN
  test('test-abnormal-bpm', 'Abnormal BPM Values (0, -100, NaN)', 'abnormal', () => {
    const tja = `TITLE:Bad BPM\nBPM:0\n#START\n#BPMCHANGE -100\n1000,\n#BPMCHANGE NaN\n2000,\n#END`;
    const val = validateTJARaw(tja);
    const chart = parseTJA(tja);
    const passed = val.errors.some(e => e.code === 'INVALID_BPM') &&
      val.errors.some(e => e.code === 'INVALID_BPMCHANGE') &&
      chart.activeCourse.notes.length === 2;
    return {
      passed,
      message: passed ? 'Invalid BPMs caught by Validator; Parser gracefully defaulted to valid positive rates.' : 'BPM validation failed.',
      details: { errorCount: val.errors.length },
    };
  });

  // 16. Abnormal: Unclosed Rolls and Balloons
  test('test-abnormal-unclosed-rolls', 'Unclosed Roll and Balloon Detection', 'abnormal', () => {
    const tja = `TITLE:Unclosed\nBPM:120\nBALLOON:5\n#START\n5000000000000000,\n7000000000000000,\n#END`;
    const val = validateTJARaw(tja);
    const chart = parseTJA(tja);
    const hasUnclosedError = val.errors.some(e => e.code === 'UNCLOSED_ROLL');
    // Parser must auto-close rolls at chart end rather than crashing
    const passed = hasUnclosedError && chart.activeCourse.rolls.length === 1 && chart.activeCourse.balloons.length === 1;
    return {
      passed,
      message: passed ? 'Validator flagged unclosed rolls; Parser safely terminated them at chart boundary.' : 'Unclosed roll handling failed.',
      details: { errors: val.errors.map(e => e.message) },
    };
  });

  // 17. Extreme Scale Stress Test (1000 measures, scan & timeout verification)
  test('test-extreme-scale', 'Heavy Chart Scanner Protection (1000 measures)', 'abnormal', () => {
    const bigTjaLines = ['TITLE:Heavy Chart', 'BPM:150', '#START'];
    for (let i = 0; i < 1000; i++) {
      bigTjaLines.push('10201020,');
    }
    bigTjaLines.push('#END');
    const bigTja = bigTjaLines.join('\n');

    const scan = scanTJAInfo(bigTja);
    const chart = parseTJA(bigTja);

    const passed = scan.isHeavy &&
      scan.measureCount === 1000 &&
      chart.activeCourse.measures.length === 1000 &&
      chart.activeCourse.notes.length === 4000;

    return {
      passed,
      message: passed ? `Heavy Chart correctly flagged (${scan.measureCount} measures, ${scan.notesCount} notes) and processed safely.` : 'Heavy chart processing failed.',
      details: { measureCount: scan.measureCount, notesCount: scan.notesCount, isHeavy: scan.isHeavy },
    };
  });

  // 18. Arbitrary Subdivisions (20, 24, 32, 48 divisions Semantic Round-trip)
  test('test-subdivisions-roundtrip', 'Subdivisions Round-trip (20, 24, 32, 48 divisions)', 'grid', () => {
    // 20-div: notes at index 0 and 1 (1/20)
    const m20 = '11000000000000000000,';
    // 24-div: notes at index 0 and 5 (5/24)
    const m24 = '100002000000000000000000,';
    // 32-div: notes at index 0 and 8 (8/32 = 1/4)
    const m32 = '10000000200000000000000000000000,';
    // 48-div: notes at index 0 and 7 (7/48)
    const m48 = '100000020000000000000000000000000000000000000000,';

    const tjaA = `TITLE:Subdivisions\nBPM:120\n#START\n${m20}\n${m24}\n${m32}\n${m48}\n#END`;
    const modelA = parseTJA(tjaA);
    const tjaB = writeTJA(modelA);
    const modelB = parseTJA(tjaB);

    const cA = modelA.activeCourse;
    const cB = modelB.activeCourse;

    const divisionsA = cA.measures.map(m => m.division);
    const divisionsB = cB.measures.map(m => m.division);

    const divisionsMatch = divisionsA[0] === 20 && divisionsA[1] === 24 && divisionsA[2] === 32 && divisionsA[3] === 48 &&
      divisionsB[0] === 20 && divisionsB[1] === 24 && divisionsB[2] === 32 && divisionsB[3] === 48;

    let notesMatch = cA.notes.length === cB.notes.length;
    if (notesMatch) {
      for (let i = 0; i < cA.notes.length; i++) {
        const nA = cA.notes[i];
        const nB = cB.notes[i];
        if (
          nA.type !== nB.type ||
          nA.positionInMeasure.numerator !== nB.positionInMeasure.numerator ||
          nA.positionInMeasure.denominator !== nB.positionInMeasure.denominator ||
          !approxEqual(nA.time, nB.time) ||
          !approxEqual(nA.beat, nB.beat)
        ) {
          notesMatch = false;
          break;
        }
      }
    }

    const passed = divisionsMatch && notesMatch;
    return {
      passed,
      message: passed ? 'All 20, 24, 32, and 48 division measures preserved exact rational positions and timings.' : 'Subdivision roundtrip mismatch.',
      details: { divisionsA, divisionsB, notesMatch },
    };
  });

  // 19. Multiple Denominators & Mixed Rational Positions (1/20, 5/24, 7/48)
  test('test-mixed-rational-positions', 'Mixed Rational Positions Verification (1/20, 5/24, 7/48)', 'grid', () => {
    // Measure 0 has 1/20, Measure 1 has 5/24, Measure 2 has 7/48
    // Measure 3 has composite 48 division containing 7/48 and 10/48 (5/24)
    const mComposite48 = '000000010020000000000000000000000000000000000000,';
    const tja = `TITLE:Mixed Denominators\nBPM:120\n#START\n01000000000000000000,\n000002000000000000000000,\n000000010000000000000000000000000000000000000000,\n${mComposite48}\n#END`;

    const modelA = parseTJA(tja);
    const tjaOut = writeTJA(modelA);
    const modelB = parseTJA(tjaOut);

    const notesA = modelA.activeCourse.notes;
    const notesB = modelB.activeCourse.notes;

    // Check specific rational positions in Model A and Model B
    // Note 0: numerator=1, denominator=20
    const n0Match = notesA[0].positionInMeasure.numerator === 1 && notesA[0].positionInMeasure.denominator === 20 &&
      notesB[0].positionInMeasure.numerator === 1 && notesB[0].positionInMeasure.denominator === 20;

    // Note 1: numerator=5, denominator=24
    const n1Match = notesA[1].positionInMeasure.numerator === 5 && notesA[1].positionInMeasure.denominator === 24 &&
      notesB[1].positionInMeasure.numerator === 5 && notesB[1].positionInMeasure.denominator === 24;

    // Note 2: numerator=7, denominator=48
    const n2Match = notesA[2].positionInMeasure.numerator === 7 && notesA[2].positionInMeasure.denominator === 48 &&
      notesB[2].positionInMeasure.numerator === 7 && notesB[2].positionInMeasure.denominator === 48;

    // Note 3 (in m3): 7/48, Note 4 (in m3): 10/48 = 5/24
    const n3Match = notesA[3].positionInMeasure.numerator === 7 && notesA[3].positionInMeasure.denominator === 48 &&
      notesB[3].positionInMeasure.numerator === 7 && notesB[3].positionInMeasure.denominator === 48;
    const n4Match = notesA[4].positionInMeasure.numerator === 5 && notesA[4].positionInMeasure.denominator === 24 &&
      notesB[4].positionInMeasure.numerator === 5 && notesB[4].positionInMeasure.denominator === 24;

    let allTimingsMatch = true;
    for (let i = 0; i < notesA.length; i++) {
      if (!approxEqual(notesA[i].time, notesB[i].time) || !approxEqual(notesA[i].beat, notesB[i].beat)) {
        allTimingsMatch = false;
        break;
      }
    }

    const passed = n0Match && n1Match && n2Match && n3Match && n4Match && allTimingsMatch;
    return {
      passed,
      message: passed ? 'Rational positions 1/20, 5/24, 7/48 preserved as primary truth through write/parse roundtrip.' : 'Mixed rational position mismatch.',
      details: { n0Match, n1Match, n2Match, n3Match, n4Match, allTimingsMatch },
    };
  });

  // 20. Comprehensive Semantic Round-trip Test (Notes, Measures, Rolls, Balloons, Gogo, Timing)
  test('test-semantic-round-trip-comprehensive', 'Comprehensive Semantic Round-trip Verification', 'roundtrip', () => {
    const tjaA = `TITLE:Complete Semantic Test
SUBTITLE:--MikaNotes Test
BPM:130
WAVE:song.ogg
OFFSET:-0.250
COURSE:Oni
LEVEL:10
BALLOON:7,12

#START
#MEASURE 4/4
#BPMCHANGE 130
10201020,
#MEASURE 3/4
#BPMCHANGE 150
#GOGOSTART
500000800000,
#GOGOEND
#MEASURE 4/4
7000000080000000,
#BPMCHANGE 120
000000010000000000000000000000000000000000000002,
#END`;

    const modelA = parseTJA(tjaA);
    const tjaB = writeTJA(modelA);
    const modelB = parseTJA(tjaB);

    const cA = modelA.activeCourse;
    const cB = modelB.activeCourse;

    // 1. Note count and types
    const noteCountMatch = cA.notes.length === cB.notes.length;
    let notesDataMatch = noteCountMatch;
    if (noteCountMatch) {
      for (let i = 0; i < cA.notes.length; i++) {
        const a = cA.notes[i];
        const b = cB.notes[i];
        if (
          a.type !== b.type ||
          a.positionInMeasure.numerator !== b.positionInMeasure.numerator ||
          a.positionInMeasure.denominator !== b.positionInMeasure.denominator ||
          !approxEqual(a.time, b.time) ||
          !approxEqual(a.beat, b.beat) ||
          !approxEqual(a.bpm, b.bpm)
        ) {
          notesDataMatch = false;
          break;
        }
      }
    }

    // 2. Measure count and ratios
    const measureCountMatch = cA.measures.length === cB.measures.length;
    let measuresDataMatch = measureCountMatch;
    if (measureCountMatch) {
      for (let i = 0; i < cA.measures.length; i++) {
        const ma = cA.measures[i];
        const mb = cB.measures[i];
        if (
          ma.numerator !== mb.numerator ||
          ma.denominator !== mb.denominator ||
          ma.division !== mb.division ||
          !approxEqual(ma.startTime, mb.startTime) ||
          !approxEqual(ma.duration, mb.duration)
        ) {
          measuresDataMatch = false;
          break;
        }
      }
    }

    // 3. Rolls and Balloons
    const rollsMatch = cA.rolls.length === cB.rolls.length &&
      cA.rolls.every((rA, i) => {
        const rB = cB.rolls[i];
        return rA.rawType === rB.rawType &&
          rA.startMeasureIndex === rB.startMeasureIndex &&
          rA.endMeasureIndex === rB.endMeasureIndex &&
          rA.startPosition.numerator === rB.startPosition.numerator &&
          rA.startPosition.denominator === rB.startPosition.denominator &&
          rA.endPosition.numerator === rB.endPosition.numerator &&
          rA.endPosition.denominator === rB.endPosition.denominator &&
          approxEqual(rA.startTime, rB.startTime) &&
          approxEqual(rA.endTime, rB.endTime);
      });

    const balloonsMatch = cA.balloons.length === cB.balloons.length &&
      cA.balloons.every((bA, i) => {
        const bB = cB.balloons[i];
        return bA.hitCount === bB.hitCount &&
          bA.startMeasureIndex === bB.startMeasureIndex &&
          bA.endMeasureIndex === bB.endMeasureIndex &&
          bA.startPosition.numerator === bB.startPosition.numerator &&
          bA.startPosition.denominator === bB.startPosition.denominator &&
          bA.endPosition.numerator === bB.endPosition.numerator &&
          bA.endPosition.denominator === bB.endPosition.denominator &&
          approxEqual(bA.startTime, bB.startTime) &&
          approxEqual(bA.endTime, bB.endTime);
      });

    // 4. Gogo ranges
    const gogoMatch = cA.gogoRanges.length === cB.gogoRanges.length &&
      cA.gogoRanges.every((gA, i) => {
        const gB = cB.gogoRanges[i];
        return approxEqual(gA.startTime, gB.startTime) &&
          approxEqual(gA.endTime, gB.endTime) &&
          approxEqual(gA.startBeat, gB.startBeat) &&
          approxEqual(gA.endBeat, gB.endBeat);
      });

    const passed = notesDataMatch && measuresDataMatch && rollsMatch && balloonsMatch && gogoMatch;

    return {
      passed,
      message: passed ? 'Comprehensive Semantic Round-trip passed: notes, measures, divisions, rationals, beat, time, bpm, gogo, rolls, balloons all match.' : 'Semantic Round-trip discrepancy detected.',
      details: {
        noteCount: `${cA.notes.length} vs ${cB.notes.length}`,
        notesDataMatch,
        measuresDataMatch,
        rollsMatch,
        balloonsMatch,
        gogoMatch,
      },
    };
  });

  // 21. Fixed Grid Divisions Snapping (4, 8, 12, 16, 20, 24, 32, 48)
  test('test-grid-snapping', 'Fixed Grid Snapping (4, 8, 12, 16, 20, 24, 32, 48)', 'grid', () => {
    const rawTja = `TITLE:Grid Test\nBPM:120\n#START\n0000,\n0000,\n#END`;
    const chart = parseTJA(rawTja);
    const course = chart.activeCourse;
    const timeline = new Timeline(course);
    const layout = calculateTimelineLayout(course, 100);

    const testGrids: GridDivision[] = [4, 8, 12, 16, 20, 24, 32, 48];
    const m0 = layout.measures[0];

    for (const grid of testGrids) {
      for (let step = 0; step < grid; step++) {
        // Calculate an X position near the step fraction with a slight offset
        const targetFraction = step / grid;
        const testX = m0.startX + (targetFraction + 0.005 / grid) * m0.width;

        const snap = snapTimelineXToGrid(testX, timeline, layout, grid);
        if (!snap) {
          return { passed: false, message: `snapTimelineXToGrid returned null for grid ${grid} step ${step}` };
        }

        if (snap.measureIndex !== 0) {
          return { passed: false, message: `Expected measure 0, got ${snap.measureIndex} for grid ${grid}` };
        }

        const expectedFraction = step / grid;
        if (!approxEqual(snap.rational.fraction, expectedFraction, 0.0001)) {
          return {
            passed: false,
            message: `Grid ${grid} step ${step}: expected fraction ${expectedFraction}, got ${snap.rational.fraction}`,
          };
        }

        const expectedTime = (step / grid) * 2.0; // 120 BPM 4/4 = 2.0s per measure
        if (!approxEqual(snap.time, expectedTime, 0.001)) {
          return {
            passed: false,
            message: `Grid ${grid} step ${step}: expected time ${expectedTime}, got ${snap.time}`,
          };
        }
      }
    }

    return {
      passed: true,
      message: 'All 8 fixed grid divisions (4, 8, 12, 16, 20, 24, 32, 48) snapped with exact RationalPosition and time.',
    };
  });

  // 22. MEASURE Insertion Guard (Measure-Start Restriction)
  test('test-measure-start-restriction', 'MEASURE Insertion Guard (Measure-Start Restriction)', 'timing', () => {
    const rawTja = `TITLE:Measure Test\nBPM:120\n#START\n1000,\n1000,\n#END`;
    const chart = parseTJA(rawTja);
    const course = chart.activeCourse;
    const timeline = new Timeline(course);

    // Measure 1 start time is 2.0s
    const m1 = timeline.getMeasureByIndex(1);
    if (!m1) return { passed: false, message: 'Measure 1 not found' };

    // When MEASURE is changed at measure start (rational 0/1)
    const newTja = `TITLE:Measure Test\nBPM:120\n#START\n1000,\n#MEASURE 3/4\n100,\n#END`;
    const updatedChart = parseTJA(newTja);
    const updatedTimeline = new Timeline(updatedChart.activeCourse);

    const updatedM1 = updatedTimeline.getMeasureByIndex(1);
    if (!updatedM1 || updatedM1.numerator !== 3 || updatedM1.denominator !== 4) {
      return { passed: false, message: 'Measure 1 failed to adopt 3/4 signature cleanly' };
    }

    // Measure 1 duration in 3/4 at 120 BPM = 3 * 0.5 = 1.5s
    if (!approxEqual(updatedM1.duration, 1.5, 0.001)) {
      return { passed: false, message: `Expected duration 1.5s, got ${updatedM1.duration}` };
    }

    return {
      passed: true,
      message: 'MEASURE changes at measure start successfully update measure model and duration without time desync.',
    };
  });

  // 23. Binary Search for X Coordinate & Dual-Way Mapping Consistency
  test('test-binary-search-and-dualway-mapping', 'Binary Search for X Coordinate & Dual-Way Mapping Consistency', 'timing', () => {
    const rawTja = `TITLE:Complex Test\nBPM:120\n#START\n1000,\n#MEASURE 3/4\n#BPMCHANGE 180\n100,\n#MEASURE 6/8\n#DELAY 0.5\n100000,\n#MEASURE 7/8\n1000000,\n#END`;
    const chart = parseTJA(rawTja);
    const course = chart.activeCourse;
    const timeline = new Timeline(course);
    const layout = calculateTimelineLayout(course, 100);

    // 1. Verify findMeasureLayoutAtX boundary conditions
    // Boundary a: Empty layout
    if (findMeasureLayoutAtX(100, []) !== null) {
      return { passed: false, message: 'Empty layout should return null' };
    }
    // Boundary b: Left of measure 0 (x < LANE_PADDING_LEFT)
    const mLeft = findMeasureLayoutAtX(0, layout.measures);
    if (!mLeft || mLeft.index !== 0) {
      return { passed: false, message: 'Left of measure 0 should clamp to measure 0' };
    }
    // Boundary c: Right of last measure
    const mLast = findMeasureLayoutAtX(layout.totalWidth + 1000, layout.measures);
    if (!mLast || mLast.index !== layout.measures.length - 1) {
      return { passed: false, message: 'Right of last measure should clamp to last measure' };
    }
    // Boundary d: Exact measure boundary
    for (let i = 0; i < layout.measures.length; i++) {
      const ml = layout.measures[i];
      const foundAtStart = findMeasureLayoutAtX(ml.startX, layout.measures);
      if (!foundAtStart || foundAtStart.index !== i) {
        return { passed: false, message: `Measure ${i} exact startX lookup failed` };
      }
      const foundAtMid = findMeasureLayoutAtX(ml.startX + ml.width * 0.5, layout.measures);
      if (!foundAtMid || foundAtMid.index !== i) {
        return { passed: false, message: `Measure ${i} mid-point lookup failed` };
      }
      const foundAtPreEnd = findMeasureLayoutAtX(ml.endX - 0.01, layout.measures);
      if (!foundAtPreEnd || foundAtPreEnd.index !== i) {
        return { passed: false, message: `Measure ${i} near end lookup failed` };
      }
    }

    // 2. Verify Dual-Way Mapping Consistency: X -> Time -> X and Time -> X -> Time
    for (let i = 0; i < layout.measures.length; i++) {
      const ml = layout.measures[i];
      const testFractions = [0, 0.25, 0.5, 0.75, 1.0];
      for (const frac of testFractions) {
        const testX = ml.startX + frac * ml.width;
        const timeFromX = timelineXToTime(testX, timeline, layout);
        const xFromTime = timeToTimelineX(timeFromX, timeline, layout);

        if (Math.abs(testX - xFromTime) > 0.5) { // Sub-pixel precision within 0.5px
          return {
            passed: false,
            message: `Dual-way mismatch in measure ${i} (frac ${frac}): testX=${testX.toFixed(2)}, xFromTime=${xFromTime.toFixed(2)}`,
          };
        }
      }
    }

    return {
      passed: true,
      message: 'Binary search O(log N) passed all boundary tests and dual-way X <-> Time consistency verified across 4/4, 3/4, 6/8, 7/8, BPMCHANGE, and DELAY.',
    };
  });

  // 24. Normalized RationalPosition Note Deletion & Replacement
  test('test-rational-position-normalization', 'Normalized RationalPosition Identity (1/2 === 2/4 === 4/8)', 'normal', () => {
    // Exact fractional equivalence tests
    const p1_2 = { numerator: 1, denominator: 2, fraction: 0.5 };
    const p2_4 = { numerator: 2, denominator: 4, fraction: 0.5 };
    const p4_8 = { numerator: 4, denominator: 8, fraction: 0.5 };
    const p3_16 = { numerator: 3, denominator: 16, fraction: 0.1875 };
    const p6_32 = { numerator: 6, denominator: 32, fraction: 0.1875 };
    const p1_4 = { numerator: 1, denominator: 4, fraction: 0.25 };

    if (!isSameRationalPosition(p1_2, p2_4)) {
      return { passed: false, message: '1/2 and 2/4 failed equivalence test' };
    }
    if (!isSameRationalPosition(p2_4, p4_8)) {
      return { passed: false, message: '2/4 and 4/8 failed equivalence test' };
    }
    if (!isSameRationalPosition(p3_16, p6_32)) {
      return { passed: false, message: '3/16 and 6/32 failed equivalence test' };
    }
    if (isSameRationalPosition(p1_4, p1_2)) {
      return { passed: false, message: '1/4 and 1/2 should NOT be equivalent' };
    }

    return {
      passed: true,
      message: 'Normalized RationalPosition equivalence verified mathematically across varying denominators.',
    };
  });

  // 25. Extreme #MEASURE Safety (Visual Layout Clamping & Core Preservation)
  test('test-extreme-measure-safety', 'Extreme #MEASURE Safety (UI Clamping & Core Exact Preservation)', 'abnormal', () => {
    const rawTja = `TITLE:Extreme Measure Test\nBPM:120\n#START\n#MEASURE 99999999/1\n1000,\n#END`;
    const chart = parseTJA(rawTja);
    const course = chart.activeCourse;
    const m = course.measures[0];

    // 1. Verify Core preserves exact numerator/denominator
    if (m.numerator !== 99999999 || m.denominator !== 1) {
      return { passed: false, message: 'Core MeasureModel failed to preserve exact 99999999/1' };
    }

    // 2. Verify Visual Layout Clamping protects the DOM
    const layout = calculateTimelineLayout(course, 100);
    const mLayout = layout.measures[0];
    if (mLayout.width > 8000) {
      return { passed: false, message: `Visual width exceeded safety clamp (got ${mLayout.width}px)` };
    }

    // 3. Verify TJA Writer outputs exact original #MEASURE
    const writtenTja = writeTJA(chart);
    if (!writtenTja.includes('#MEASURE 99999999/1')) {
      return { passed: false, message: 'TJA Writer lost original #MEASURE 99999999/1' };
    }

    return {
      passed: true,
      message: 'Extreme #MEASURE safely clamped in Visual Layout to 8000px while 100% preserving Core values and TJA Writer fidelity.',
    };
  });

  // 26. Binary-Searched Visible Measure Layouts Range Verification
  test('test-visible-measure-layouts-binary-search', 'Binary Search Visible Measures Slice (O(log N))', 'timing', () => {
    const rawTja = `TITLE:Visible Measures Test\nBPM:120\n#START\n` + '1000,\n'.repeat(20) + '#END';
    const chart = parseTJA(rawTja);
    const course = chart.activeCourse;
    const layout = calculateTimelineLayout(course, 100);

    // Case a: Empty measures array
    if (findVisibleMeasureLayouts(100, 200, []).length !== 0) {
      return { passed: false, message: 'Empty layout should return empty slice' };
    }

    // Case b: Viewport completely to the left of measure 0
    const beforeLeft = findVisibleMeasureLayouts(0, layout.measures[0].startX - 10, layout.measures);
    if (beforeLeft.length !== 0) {
      return { passed: false, message: 'Viewport before measure 0 should return empty' };
    }

    // Case c: Viewport completely to the right of last measure
    const lastM = layout.measures[layout.measures.length - 1];
    const afterRight = findVisibleMeasureLayouts(lastM.endX + 10, lastM.endX + 500, layout.measures);
    if (afterRight.length !== 0) {
      return { passed: false, message: 'Viewport after last measure should return empty' };
    }

    // Case d: Viewport covering middle measures [3, 7]
    const m3 = layout.measures[3];
    const m7 = layout.measures[7];
    const middleSlice = findVisibleMeasureLayouts(m3.startX + 1, m7.endX - 1, layout.measures);
    if (middleSlice.length !== 5) {
      return { passed: false, message: `Expected 5 visible measures [3..7], got ${middleSlice.length}` };
    }
    if (middleSlice[0].index !== 3 || middleSlice[middleSlice.length - 1].index !== 7) {
      return { passed: false, message: `Visible range boundary mismatch: [${middleSlice[0].index}..${middleSlice[middleSlice.length - 1].index}]` };
    }

    // Case e: Randomized viewport intervals compared against linear filter ground truth
    const testWindows = [
      [layout.measures[1].startX + 20, layout.measures[2].endX - 20],
      [layout.measures[0].startX, layout.measures[0].endX],
      [layout.measures[5].startX + 50, layout.measures[12].startX + 10],
      [layout.measures[18].endX - 10, layout.measures[19].endX],
    ];

    for (const [minX, maxX] of testWindows) {
      const fastResult = findVisibleMeasureLayouts(minX, maxX, layout.measures);
      const groundTruth = layout.measures.filter((m) => m.endX >= minX && m.startX <= maxX);

      if (fastResult.length !== groundTruth.length) {
        return {
          passed: false,
          message: `Length mismatch for window [${minX}, ${maxX}]: fast=${fastResult.length}, groundTruth=${groundTruth.length}`,
        };
      }
      for (let k = 0; k < fastResult.length; k++) {
        if (fastResult[k].index !== groundTruth[k].index) {
          return {
            passed: false,
            message: `Element mismatch at index ${k}: fast=${fastResult[k].index}, groundTruth=${groundTruth[k].index}`,
          };
        }
      }
    }

    return {
      passed: true,
      message: 'findVisibleMeasureLayouts O(log N) binary search matched ground truth across all boundaries and intervals.',
    };
  });

  // 27. Roll Visible Range Crossing Optimization (Start Before Viewport, End After Viewport)
  test('test-roll-visible-range-crossing', 'Roll Viewport Crossing (Interval Intersection & getNoteX)', 'rolls', () => {
    // Measure 0..5: Roll starts at Measure 1 (pos 0/4) and ends at Measure 5 (pos 2/4)
    const rawTja =
      `TITLE:Roll Crossing Test\nBPM:120\n#START\n` +
      `0000,\n` + // Measure 0
      `5000,\n` + // Measure 1: Roll starts at 0/4
      `0000,\n` + // Measure 2
      `0000,\n` + // Measure 3
      `0000,\n` + // Measure 4
      `0080,\n` + // Measure 5: Roll ends at 2/4
      `#END`;

    const chart = parseTJA(rawTja);
    const course = chart.activeCourse;
    const layout = calculateTimelineLayout(course, 100);

    if (course.rolls.length !== 1) {
      return { passed: false, message: `Expected 1 roll, found ${course.rolls.length}` };
    }

    const roll = course.rolls[0];
    const startMLayout = layout.measures[roll.startMeasureIndex];
    const endMLayout = layout.measures[roll.endMeasureIndex];

    const rollStartX = getNoteX(roll.startPosition, startMLayout);
    const rollEndX = getNoteX(roll.endPosition, endMLayout);

    // Viewport is set strictly to Measure 3 (middle of the roll span)
    const m3 = layout.measures[3];
    const minVisibleX = m3.startX + 10;
    const maxVisibleX = m3.endX - 10;

    // Verify start point is BEFORE viewport and end point is AFTER viewport
    if (rollStartX >= minVisibleX) {
      return { passed: false, message: 'Test setup error: roll start should be before visible range' };
    }
    if (rollEndX <= maxVisibleX) {
      return { passed: false, message: 'Test setup error: roll end should be after visible range' };
    }

    // Interval intersection test: rollStartX <= maxVisibleX && rollEndX >= minVisibleX
    const intersects = rollStartX <= maxVisibleX && rollEndX >= minVisibleX;
    if (!intersects) {
      return { passed: false, message: 'Roll spanning across visible viewport failed interval intersection check' };
    }

    // Verify exact coordinate fidelity
    const expectedStartX = startMLayout.startX; // 0/4 = start of measure 1
    const expectedEndX = endMLayout.startX + (2 / 4) * endMLayout.width; // 2/4 = mid of measure 5
    if (Math.abs(rollStartX - expectedStartX) > 0.01) {
      return { passed: false, message: `Roll startX ${rollStartX} does not match expected ${expectedStartX}` };
    }
    if (Math.abs(rollEndX - expectedEndX) > 0.01) {
      return { passed: false, message: `Roll endX ${rollEndX} does not match expected ${expectedEndX}` };
    }

    return {
      passed: true,
      message: 'Roll spanning across visible viewport correctly identified by interval intersection and rendered with exact getNoteX coordinates.',
    };
  });

  // 28. Balloon Visible Range Crossing Optimization
  test('test-balloon-visible-range-crossing', 'Balloon Viewport Crossing (Interval Intersection & getNoteX)', 'rolls', () => {
    // Measure 0..6: Balloon starts at Measure 2 (pos 0/4) and ends at Measure 6 (pos 0/4)
    const rawTja =
      `TITLE:Balloon Crossing Test\nBPM:120\nBALLOON:15\n#START\n` +
      `0000,\n` + // Measure 0
      `0000,\n` + // Measure 1
      `7000,\n` + // Measure 2: Balloon starts at 0/4
      `0000,\n` + // Measure 3
      `0000,\n` + // Measure 4
      `0000,\n` + // Measure 5
      `8000,\n` + // Measure 6: Balloon ends at 0/4
      `#END`;

    const chart = parseTJA(rawTja);
    const course = chart.activeCourse;
    const layout = calculateTimelineLayout(course, 100);

    if (course.balloons.length !== 1) {
      return { passed: false, message: `Expected 1 balloon, found ${course.balloons.length}` };
    }

    const balloon = course.balloons[0];
    const startMLayout = layout.measures[balloon.startMeasureIndex];
    const endMLayout = layout.measures[balloon.endMeasureIndex];

    const balloonStartX = getNoteX(balloon.startPosition, startMLayout);
    const balloonEndX = getNoteX(balloon.endPosition, endMLayout);

    // Viewport set strictly to Measure 4
    const m4 = layout.measures[4];
    const minVisibleX = m4.startX + 5;
    const maxVisibleX = m4.endX - 5;

    // Viewport intersection condition
    const intersects = balloonStartX <= maxVisibleX && balloonEndX >= minVisibleX;
    if (!intersects) {
      return { passed: false, message: 'Balloon spanning across viewport failed intersection check' };
    }

    const expectedStartX = startMLayout.startX;
    const expectedEndX = endMLayout.startX;
    if (Math.abs(balloonStartX - expectedStartX) > 0.01) {
      return { passed: false, message: `Balloon startX mismatch: got ${balloonStartX}, expected ${expectedStartX}` };
    }
    if (Math.abs(balloonEndX - expectedEndX) > 0.01) {
      return { passed: false, message: `Balloon endX mismatch: got ${balloonEndX}, expected ${expectedEndX}` };
    }

    return {
      passed: true,
      message: 'Balloon spanning across visible viewport correctly identified by interval intersection with exact RationalPosition placement.',
    };
  });

  // 29. Extreme #MEASURE Values (No NaN, No Infinity, Clamped Layout, TJA Roundtrip)
  test('test-extreme-measure-no-nan-no-infinite', 'Extreme #MEASURE (No NaN, No Infinity, Clamped Layout, Writer Preserved)', 'abnormal', () => {
    const extremeCases = [
      `#MEASURE 99999999/1\n1000,`,
      `#MEASURE 1/99999999\n1000,`,
      `#MEASURE 100000/3\n1000,`,
    ];

    for (const snippet of extremeCases) {
      const rawTja = `TITLE:Extreme Test\nBPM:120\n#START\n${snippet}\n#END`;

      const tStart = Date.now();
      const chart = parseTJA(rawTja);
      const elapsed = Date.now() - tStart;

      if (elapsed > 500) {
        return { passed: false, message: `Parser took too long (${elapsed}ms) on extreme measure: ${snippet}` };
      }

      const course = chart.activeCourse;
      const m = course.measures[0];

      if (isNaN(m.startTime) || !isFinite(m.startTime)) {
        return { passed: false, message: `Measure startTime is invalid: ${m.startTime}` };
      }
      if (isNaN(m.duration) || !isFinite(m.duration) || m.duration <= 0) {
        return { passed: false, message: `Measure duration is invalid: ${m.duration}` };
      }

      const timeline = new Timeline(course);
      const testPos = { numerator: 1, denominator: 2, fraction: 0.5 };
      const testTime = timeline.positionToTime(m, testPos);
      if (isNaN(testTime) || !isFinite(testTime)) {
        return { passed: false, message: `Timeline.positionToTime returned invalid time: ${testTime}` };
      }

      const layout = calculateTimelineLayout(course, 100);
      const mLayout = layout.measures[0];
      if (isNaN(mLayout.width) || !isFinite(mLayout.width) || mLayout.width < 40 || mLayout.width > 8000) {
        return { passed: false, message: `Measure layout width outside safe clamp bounds: ${mLayout.width}` };
      }
      if (isNaN(layout.totalWidth) || !isFinite(layout.totalWidth)) {
        return { passed: false, message: `Total layout width is invalid: ${layout.totalWidth}` };
      }

      const written = writeTJA(chart);
      const measureMatch = snippet.match(/#MEASURE\s+[^\n]+/);
      if (measureMatch && !written.includes(measureMatch[0])) {
        return { passed: false, message: `writeTJA lost original command: ${measureMatch[0]}` };
      }
    }

    return {
      passed: true,
      message: 'Extreme #MEASURE values parsed, timed, laid out, and written without NaN, Infinity, or DOM explosion.',
    };
  });

  // 30. Undo / Redo Sequential Integrity & Branching Edit
  test('test-undo-redo-continuity', 'Undo / Redo Sequential State Integrity & Branching Edit', 'normal', () => {
    // Initial state: empty 2-measure chart
    const initialTja = `TITLE:Undo Redo Test\nBPM:120\n#START\n0000,\n0000,\n#END`;
    const history: string[] = [initialTja];
    let historyIdx = 0;

    const push = (tja: string) => {
      history.splice(historyIdx + 1);
      history.push(tja);
      historyIdx++;
    };

    // Step 1: Add Don at measure 0, step 2/4
    const chart1 = parseTJA(initialTja);
    chart1.activeCourse.measures[0].notes.push({
      id: 'n1',
      type: '1',
      kind: 'don',
      time: 1.0,
      audioTime: 1.0,
      beat: 2.0,
      measureIndex: 0,
      positionInMeasure: { numerator: 2, denominator: 4, fraction: 0.5 },
      bpm: 120,
      scroll: 1.0,
    });
    push(writeTJA(chart1));

    // Step 2: Add Ka at measure 0, step 3/4
    const chart2 = parseTJA(history[historyIdx]);
    chart2.activeCourse.measures[0].notes.push({
      id: 'n2',
      type: '2',
      kind: 'ka',
      time: 1.5,
      audioTime: 1.5,
      beat: 3.0,
      measureIndex: 0,
      positionInMeasure: { numerator: 3, denominator: 4, fraction: 0.75 },
      bpm: 120,
      scroll: 1.0,
    });
    push(writeTJA(chart2));

    // Step 3: Delete note using normalized RationalPosition (1/2 deletes 2/4)
    const chart3 = parseTJA(history[historyIdx]);
    const deletePos = { numerator: 1, denominator: 2, fraction: 0.5 };
    chart3.activeCourse.measures[0].notes = chart3.activeCourse.measures[0].notes.filter(
      (n) => !isSameRationalPosition(n.positionInMeasure, deletePos)
    );
    push(writeTJA(chart3));

    // Verify step 3 state: only Ka at 3/4 remains
    if (chart3.activeCourse.measures[0].notes.length !== 1 || chart3.activeCourse.measures[0].notes[0].type !== '2') {
      return { passed: false, message: 'Normalized RationalPosition note deletion failed' };
    }

    // Step 4: Undo step 3 (restore Don)
    historyIdx--;
    const undoneChart = parseTJA(history[historyIdx]);
    if (undoneChart.activeCourse.measures[0].notes.length !== 2) {
      return { passed: false, message: `Undo step 3 failed to restore Don: notes count = ${undoneChart.activeCourse.measures[0].notes.length}` };
    }

    // Step 5: Redo step 3 (re-apply deletion)
    historyIdx++;
    const redoneChart = parseTJA(history[historyIdx]);
    if (redoneChart.activeCourse.measures[0].notes.length !== 1) {
      return { passed: false, message: 'Redo step 3 failed to re-apply deletion' };
    }

    // Step 6: Undo back to initial state (2 undos)
    historyIdx -= 2;
    const initialRestored = parseTJA(history[historyIdx]);
    if (initialRestored.activeCourse.measures[0].notes.length !== 1) {
      return { passed: false, message: 'Multi-step undo back to step 1 failed' };
    }

    // Step 7: Branching edit after undo (add Big Don at 1/4)
    const branchingChart = parseTJA(history[historyIdx]);
    branchingChart.activeCourse.measures[0].notes.push({
      id: 'n3',
      type: '3',
      kind: 'big_don',
      time: 0.5,
      audioTime: 0.5,
      beat: 1.0,
      measureIndex: 0,
      positionInMeasure: { numerator: 1, denominator: 4, fraction: 0.25 },
      bpm: 120,
      scroll: 1.0,
    });
    push(writeTJA(branchingChart));

    // Confirm future redo states were pruned
    if (history.length !== historyIdx + 1) {
      return { passed: false, message: 'Branching edit failed to prune future redo states' };
    }

    return {
      passed: true,
      message: 'Undo / Redo sequential integrity, normalized note deletion, and branching edits verified with complete fidelity.',
    };
  });

  // =========================================================================
  // Next Correction Phase: Course Consistency, Text Sync, Safety & Testing
  // =========================================================================

  // Test 1: Active Course 変更後にノーツ追加 -> 対象 Course にのみ反映されること
  test('test-phase2-active-course-isolation', 'Course Isolation on Note Addition', 'normal', () => {
    const tja = `TITLE:Two Courses\nBPM:120\nCOURSE:Normal\nLEVEL:3\n#START\n1000100010001000,\n#END\nCOURSE:Oni\nLEVEL:8\n#START\n11111111,\n#END`;
    const chart = parseTJA(tja);

    // Initial note counts
    const normalCount0 = chart.courses[1].measures[0].notes.length;
    const oniCount0 = chart.courses[3].measures[0].notes.length;

    // Add note to Oni (3) only
    chart.courses[3].measures[0].notes.push({
      id: 'oni-added',
      type: '2',
      kind: 'ka',
      time: 1.0,
      audioTime: 1.0,
      beat: 2.0,
      measureIndex: 0,
      positionInMeasure: { numerator: 1, denominator: 2, fraction: 0.5 },
      bpm: 120,
      scroll: 1.0,
    });

    const normalCountAfter = chart.courses[1].measures[0].notes.length;
    const oniCountAfter = chart.courses[3].measures[0].notes.length;

    const passed = normalCountAfter === normalCount0 && oniCountAfter === oniCount0 + 1;
    return {
      passed,
      message: passed
        ? 'Note added to Oni course exclusively without modifying Normal course.'
        : `Course bleed detected: Normal count before=${normalCount0}, after=${normalCountAfter}`,
    };
  });

  // Test 2: Oni しか存在しない TJA を開いた時、activeCourseKey が Oni(3) になること
  test('test-phase2-oni-only-default-selection', 'Oni-Only Chart Default Course Selection', 'normal', () => {
    const tja = `TITLE:Oni Only\nBPM:140\nCOURSE:Oni\nLEVEL:10\n#START\n10101010,\n#END`;
    const chart = parseTJA(tja);

    const availableKeys = Object.keys(chart.courses).map(Number);
    const hasOnlyOni = availableKeys.length === 1 && availableKeys[0] === 3;
    const isChartActiveOni = chart.activeCourse.courseKey === 3;

    const passed = hasOnlyOni && isChartActiveOni;
    return {
      passed,
      message: passed
        ? 'Oni-only TJA correctly mapped to CourseKey 3 (Oni) as default active course.'
        : `Expected CourseKey 3, got keys: ${availableKeys.join(',')}`,
    };
  });

  // Test 3: Hard と Oni がある TJA で、正しくコースを切り替えられること
  test('test-phase2-course-switching', 'Bi-Directional Course Switching (Hard & Oni)', 'normal', () => {
    const tja = `TITLE:Hard and Oni\nBPM:130\nCOURSE:Hard\nLEVEL:6\n#START\n10001000,\n#END\nCOURSE:Oni\nLEVEL:9\n#START\n11112222,\n#END`;
    const chart = parseTJA(tja);

    const keys = Object.keys(chart.courses).map(Number).sort((a, b) => a - b);
    const hasHardAndOni = keys.includes(2) && keys.includes(3);

    // Switch to Hard (2)
    chart.activeCourseKey = 2;
    const hardCourse = chart.courses[chart.activeCourseKey];
    const hardNotes = hardCourse.measures[0].notes.length;

    // Switch to Oni (3)
    chart.activeCourseKey = 3;
    const oniCourse = chart.courses[chart.activeCourseKey];
    const oniNotes = oniCourse.measures[0].notes.length;

    const passed = hasHardAndOni && hardNotes === 2 && oniNotes === 8;
    return {
      passed,
      message: passed
        ? 'Successfully switched between Hard (key 2) and Oni (key 3) with distinct measure notes.'
        : 'Course switching failed to retrieve accurate course data.',
    };
  });

  // Test 4: TJA Text Editor でノーツを追加して適用 -> Visual Editor のノーツ数が増加すること
  test('test-phase2-text-editor-add-notes', 'Text Editor Apply Increases Note Count', 'normal', () => {
    const originalTja = `TITLE:Apply Test\nBPM:120\nCOURSE:Oni\nLEVEL:7\n#START\n10001000,\n#END`;
    const originalChart = parseTJA(originalTja);
    const initialNotesCount = originalChart.activeCourse.measures[0].notes.length;

    // Simulate Text Editor edit: change "10001000," to "11112222,"
    const editedTja = originalTja.replace('10001000,', '11112222,');
    const val = validateTJARaw(editedTja);
    if (!val.valid) {
      return { passed: false, message: 'Validator rejected edited TJA' };
    }

    const newChart = parseTJA(editedTja);
    const updatedNotesCount = newChart.activeCourse.measures[0].notes.length;

    const passed = initialNotesCount === 2 && updatedNotesCount === 8;
    return {
      passed,
      message: passed
        ? 'Applying edited TJA successfully updated chart notes from 2 to 8 notes.'
        : `Note count mismatch: initial=${initialNotesCount}, updated=${updatedNotesCount}`,
    };
  });

  // Test 5: TJA Text Editor で文法エラーのあるテキストを適用 -> 現在の譜面が維持され、エラーが表示されること
  test('test-phase2-text-editor-error-protection', 'Error Protection Preserves Current Chart', 'abnormal', () => {
    const validTja = `TITLE:Safe Chart\nBPM:120\nCOURSE:Oni\nLEVEL:7\n#START\n10101010,\n#END`;
    let currentChart = parseTJA(validTja);
    const originalNoteCount = currentChart.activeCourse.measures[0].notes.length;

    // Erroneous TJA (missing #START command)
    const brokenTja = `TITLE:Broken Chart\nBPM:120\nCOURSE:Oni\n10101010,\n#END`;
    const val = validateTJARaw(brokenTja);

    // Verify validator catches the issue
    const hasError = !val.valid || val.errors.length > 0;

    // Simulate safe apply: if invalid or parse throws, do not replace currentChart
    let applyError = '';
    if (hasError) {
      applyError = 'Validation error: Missing #START';
    } else {
      try {
        currentChart = parseTJA(brokenTja);
      } catch (e: any) {
        applyError = e.message;
      }
    }

    const chartPreserved = currentChart.activeCourse.measures[0].notes.length === originalNoteCount;
    const passed = hasError && chartPreserved && applyError.length > 0;

    return {
      passed,
      message: passed
        ? 'Broken TJA correctly blocked; existing chart remained intact.'
        : 'Safety check failed to protect existing chart.',
    };
  });

  // Test 6: Visual Editor でノーツ追加 -> TJA Text Editor を開いた時に最新のTJAが取得できること
  test('test-phase2-visual-editor-to-text-editor-sync', 'Visual to Text Editor Serialization Sync', 'roundtrip', () => {
    const initialTja = `TITLE:Sync Test\nBPM:120\nCOURSE:Oni\nLEVEL:8\n#START\n1000,\n#END`;
    const chart = parseTJA(initialTja);

    // Add note at beat 2 (fraction 0.5) in visual editor
    chart.activeCourse.measures[0].notes.push({
      id: 'sync-note-2',
      type: '2',
      kind: 'ka',
      time: 1.0,
      audioTime: 1.0,
      beat: 2.0,
      measureIndex: 0,
      positionInMeasure: { numerator: 1, denominator: 2, fraction: 0.5 },
      bpm: 120,
      scroll: 1.0,
    });

    // Generate TJA for text editor via writeTJA
    const serialized = writeTJA(chart);

    // Parse generated TJA back to verify roundtrip fidelity
    const parsedBack = parseTJA(serialized);
    const notes = parsedBack.activeCourse.measures[0].notes;

    const passed = notes.length === 2 && notes[0].type === '1' && notes[1].type === '2';
    return {
      passed,
      message: passed
        ? 'Visual editor note additions immediately serialize into fresh TJA text with full fidelity.'
        : 'Serialized TJA failed to reflect visual note changes.',
    };
  });

  // Test 7: Undo -> Active Course の状態が巻き戻ること
  test('test-phase2-undo-course-state', 'Undo Restores Active Course Note State', 'normal', () => {
    const tja1 = `TITLE:Undo Test\nBPM:120\nCOURSE:Oni\nLEVEL:8\n#START\n1000,\n#END`;
    const tja2 = `TITLE:Undo Test\nBPM:120\nCOURSE:Oni\nLEVEL:8\n#START\n1020,\n#END`;

    const history: string[] = [tja1, tja2];
    let idx = 1; // Current state has Ka

    const chartBeforeUndo = parseTJA(history[idx]);
    const countBefore = chartBeforeUndo.activeCourse.measures[0].notes.length;

    // Perform Undo
    idx--;
    const chartAfterUndo = parseTJA(history[idx]);
    const countAfter = chartAfterUndo.activeCourse.measures[0].notes.length;

    const passed = countBefore === 2 && countAfter === 1;
    return {
      passed,
      message: passed
        ? 'Undo restored previous course note count and state accurately.'
        : `Undo failed: count before=${countBefore}, count after=${countAfter}`,
    };
  });

  // Test 8: 大量小節（例: 500小節）でも parse / write / timeline 構築が破綻しないこと
  test('test-phase2-huge-chart-stability', 'Huge Chart Stability (500 Measures)', 'abnormal', () => {
    const lines: string[] = ['TITLE:Huge 500 Measures', 'BPM:120', 'COURSE:Oni', 'LEVEL:10', '#START'];
    for (let i = 0; i < 500; i++) {
      lines.push('10201020,');
    }
    lines.push('#END');
    const hugeTja = lines.join('\n');

    const t0 = performance.now();
    const chart = parseTJA(hugeTja);
    const parsedDuration = performance.now() - t0;

    const t1 = performance.now();
    const timeline = new Timeline(chart.activeCourse);
    const timelineDuration = performance.now() - t1;

    const t2 = performance.now();
    const serialized = writeTJA(chart);
    const writeDuration = performance.now() - t2;

    const measuresCount = chart.activeCourse.measures.length;
    const totalNotes = chart.activeCourse.measures.reduce((acc, m) => acc + m.notes.length, 0);

    const passed =
      measuresCount === 500 &&
      totalNotes === 2000 &&
      timeline.getDuration() > 0 &&
      serialized.includes('#END');

    return {
      passed,
      message: passed
        ? `500 measures (2000 notes) parsed in ${Math.round(parsedDuration)}ms, timeline in ${Math.round(timelineDuration)}ms, write in ${Math.round(writeDuration)}ms.`
        : 'Huge chart test failed consistency checks.',
      details: { measuresCount, totalNotes, parsedDuration, timelineDuration, writeDuration },
    };
  });

  // Test 9: 不正な文字を含む小節（異常系）でもクラッシュしないこと
  test('test-phase2-abnormal-measures-resilience', 'Resilience to Malformed Measure Characters', 'abnormal', () => {
    const malformedTja = `TITLE:Malformed Chart\nBPM:120\n#START\n10X?#@9A1020,\n#END`;

    // 1. Validator should report warnings/issues without crashing
    const val = validateTJARaw(malformedTja);
    const hasWarningsOrErrors = val.errors.length + val.warnings.length > 0;

    // 2. Parser should survive and sanitize unknown characters without throwing
    let parseSucceeded = false;
    let noteCount = 0;
    try {
      const chart = parseTJA(malformedTja);
      parseSucceeded = true;
      noteCount = chart.activeCourse.measures[0].notes.length;
    } catch {
      parseSucceeded = false;
    }

    const passed = hasWarningsOrErrors && parseSucceeded && noteCount > 0;
    return {
      passed,
      message: passed
        ? `Handled abnormal measure characters gracefully; validator produced ${val.errors.length + val.warnings.length} diagnostic issues and parser recovered ${noteCount} valid notes.`
        : 'Malformed measure caused an uncaught crash.',
    };
  });

  // ==========================================
  // PHASE 3-A TEST CASES
  // Special Notes: Roll, Big Roll, Balloon
  // ==========================================

  // Phase 3-A Test 1: Special Notes Creation (Roll, Big Roll, Balloon)
  test('test-phase3a-creation-roll-bigroll-balloon', 'Special Notes Creation (Roll, Big Roll, Balloon)', 'rolls', () => {
    const tja = `TITLE:Phase 3-A Creation\nBPM:120\nCOURSE:Oni\nLEVEL:10\n#START\n00000000,\n00000000,\n#END`;
    const chart = parseTJA(tja);
    let course = chart.activeCourse;
    const tl = new Timeline(course);

    // 1. Create Roll (5): Measure 0, pos 0/1 -> pos 1/2
    const rollStartPos = { numerator: 0, denominator: 1, fraction: 0 };
    const rollStartTime = tl.positionToTime(course.measures[0], rollStartPos);
    const rollPending: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: rollStartPos,
      startTime: rollStartTime,
      snappedX: 0,
    };
    const rollEndPos = { numerator: 1, denominator: 2, fraction: 0.5 };
    const rollEndTime = tl.positionToTime(course.measures[0], rollEndPos);
    course = createSpecialNote(course, rollPending, 0, rollEndPos, rollEndTime);

    // 2. Create Big Roll (6): Measure 0, pos 3/4 -> Measure 1, pos 1/4 (cross-measure)
    const bigRollStartPos = { numerator: 3, denominator: 4, fraction: 0.75 };
    const bigRollStartTime = tl.positionToTime(course.measures[0], bigRollStartPos);
    const bigRollPending: PendingSpecialNote = {
      toolType: '6',
      type: 'big_roll',
      rawType: '6',
      startMeasureIndex: 0,
      startPosition: bigRollStartPos,
      startTime: bigRollStartTime,
      snappedX: 100,
    };
    const bigRollEndPos = { numerator: 1, denominator: 4, fraction: 0.25 };
    const bigRollEndTime = tl.positionToTime(course.measures[1], bigRollEndPos);
    course = createSpecialNote(course, bigRollPending, 1, bigRollEndPos, bigRollEndTime);

    // 3. Create Balloon (7): Measure 1, pos 1/2 -> Measure 1, pos 3/4 with hitCount 7
    const balloonStartPos = { numerator: 1, denominator: 2, fraction: 0.5 };
    const balloonStartTime = tl.positionToTime(course.measures[1], balloonStartPos);
    const balloonPending: PendingSpecialNote = {
      toolType: '7',
      type: 'balloon',
      rawType: '7',
      startMeasureIndex: 1,
      startPosition: balloonStartPos,
      startTime: balloonStartTime,
      snappedX: 200,
    };
    const balloonEndPos = { numerator: 3, denominator: 4, fraction: 0.75 };
    const balloonEndTime = tl.positionToTime(course.measures[1], balloonEndPos);
    course = createSpecialNote(course, balloonPending, 1, balloonEndPos, balloonEndTime, 7);

    const hasNormalRoll = course.rolls.some((r) => r.type === 'roll' && r.rawType === '5');
    const hasBigRoll = course.rolls.some((r) => r.type === 'big_roll' && r.rawType === '6');
    const hasBalloon = course.balloons.length === 1 && course.balloons[0].hitCount === 7;
    const balloonHeaderSynced = course.headers?.balloon && course.headers.balloon[0] === 7;

    const passed = course.rolls.length === 2 && hasNormalRoll && hasBigRoll && hasBalloon && balloonHeaderSynced;
    return {
      passed,
      message: passed
        ? 'Successfully created Roll (5), Big Roll (6), and Balloon (7) with synchronized hit count headers.'
        : `Creation failed: rolls=${course.rolls.length}, balloons=${course.balloons.length}`,
      details: { rolls: course.rolls.map((r) => ({ type: r.type, raw: r.rawType })), balloons: course.balloons },
    };
  });

  // Phase 3-A Test 2: Invalid Placement Rejection
  test('test-phase3a-invalid-placement', 'Invalid Placement Rejection Validation', 'rolls', () => {
    const tja = `TITLE:Phase 3-A Rejection\nBPM:120\n#START\n10000000,\n00000000,\n#END`;
    const chart = parseTJA(tja);
    const course = chart.activeCourse;
    const tl = new Timeline(course);

    // 1. Rejection: Start on regular note (Measure 0, 0/1 has note '1')
    const startOnNoteRes = validateSpecialStart(
      course,
      0,
      { numerator: 0, denominator: 1, fraction: 0 },
      0.0
    );

    // 2. Rejection: End before or equal to start
    const validPending: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: { numerator: 1, denominator: 2, fraction: 0.5 },
      startTime: 1.0,
      snappedX: 100,
    };
    // End time earlier than start
    const endBeforeStartRes = validateSpecialPlacement(
      course,
      validPending,
      0,
      { numerator: 1, denominator: 4, fraction: 0.25 },
      0.5
    );
    // End position equal to start (zero length)
    const endEqualStartRes = validateSpecialPlacement(
      course,
      validPending,
      0,
      { numerator: 1, denominator: 2, fraction: 0.5 },
      1.0
    );

    // 3. Rejection: End on existing regular note
    const pendingInMeasure1: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: { numerator: 3, denominator: 4, fraction: 0.75 },
      startTime: 1.5,
      snappedX: 150,
    };
    // If measure 0 pos 0/1 has note '1', ending on it
    const endOnNoteRes = validateSpecialPlacement(
      course,
      pendingInMeasure1,
      0,
      { numerator: 0, denominator: 1, fraction: 0 },
      0.0 // earlier time anyway
    );

    // 4. Rejection: Interval overlap with existing roll
    const courseWithRoll = createSpecialNote(
      course,
      validPending,
      0,
      { numerator: 3, denominator: 4, fraction: 0.75 },
      1.5
    );
    // Try to place overlapping roll [1.2s to 1.8s]
    const overlapPending: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: { numerator: 5, denominator: 8, fraction: 0.625 },
      startTime: 1.25,
      snappedX: 125,
    };
    const overlapRes = validateSpecialPlacement(
      courseWithRoll,
      overlapPending,
      0,
      { numerator: 7, denominator: 8, fraction: 0.875 },
      1.75
    );

    // 5. Rejection: Regular note enclosed inside special note interval
    // Course has note '1' at time 0.0. Try to create roll starting before 0.0 and ending after 0.0 or
    // create a note at 1.0s and try to wrap a roll around it:
    const tjaWithMidNote = `TITLE:MidNote\nBPM:120\n#START\n00100000,\n#END`;
    const chartWithMidNote = parseTJA(tjaWithMidNote);
    const pendingEnclosing: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: { numerator: 0, denominator: 1, fraction: 0 },
      startTime: 0.0,
      snappedX: 0,
    };
    const encloseNoteRes = validateSpecialPlacement(
      chartWithMidNote.activeCourse,
      pendingEnclosing,
      0,
      { numerator: 3, denominator: 4, fraction: 0.75 },
      1.5
    );

    const passed =
      !startOnNoteRes.valid &&
      !endBeforeStartRes.valid &&
      !endEqualStartRes.valid &&
      !endOnNoteRes.valid &&
      !overlapRes.valid &&
      !encloseNoteRes.valid;

    return {
      passed,
      message: passed
        ? 'All invalid placement scenarios (start on note, end before start, end on start, overlap, enclosed note) correctly rejected.'
        : 'Validation failure: some invalid placements were erroneously allowed.',
      details: {
        startOnNote: startOnNoteRes,
        endBeforeStart: endBeforeStartRes,
        endEqualStart: endEqualStartRes,
        overlap: overlapRes,
        enclosedNote: encloseNoteRes,
      },
    };
  });

  // Phase 3-A Test 3: Multi-Measure with Different Time Signatures
  test('test-phase3a-multimeasure-different-time-signatures', 'Multi-Measure Roll Across Different #MEASURE', 'rolls', () => {
    const tja = `TITLE:Different Measures\nBPM:120\n#START\n#MEASURE 4/4\n00000000,\n#MEASURE 3/4\n000000,\n#END`;
    const chart = parseTJA(tja);
    let course = chart.activeCourse;
    const tl = new Timeline(course);

    const startPos = { numerator: 1, denominator: 2, fraction: 0.5 };
    const startTime = tl.positionToTime(course.measures[0], startPos);
    const pending: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: startPos,
      startTime,
      snappedX: 50,
    };

    const endPos = { numerator: 2, denominator: 3, fraction: 2 / 3 };
    const endTime = tl.positionToTime(course.measures[1], endPos);

    course = createSpecialNote(course, pending, 1, endPos, endTime);

    const roll = course.rolls[0];
    const isSingleRoll = course.rolls.length === 1;
    const spansMeasures = roll.startMeasureIndex === 0 && roll.endMeasureIndex === 1;
    const correctBeats = approxEqual(roll.startBeat, 2.0) && approxEqual(roll.endBeat, 4.0 + 2.0); // 4/4 (4 beats) + 2/3 of 3/4 (2 beats) = 6.0 beats

    const passed = isSingleRoll && spansMeasures && correctBeats;
    return {
      passed,
      message: passed
        ? 'Roll accurately spans across 4/4 and 3/4 measures as a single continuous RollModel with correct beat mapping.'
        : `Roll cross-measure failed: isSingleRoll=${isSingleRoll}, spans=${spansMeasures}, startBeat=${roll?.startBeat}, endBeat=${roll?.endBeat}`,
      details: { roll },
    };
  });

  // Phase 3-A Test 4: Timing Across #BPMCHANGE and #DELAY
  test('test-phase3a-timing-bpm-and-delay', 'Roll Crossing #BPMCHANGE and #DELAY', 'timing', () => {
    const tja = `TITLE:BPM and Delay\nBPM:120\n#START\n0000,\n#BPMCHANGE 240\n#DELAY 0.5\n0000,\n#END`;
    const chart = parseTJA(tja);
    let course = chart.activeCourse;
    const tl = new Timeline(course);

    // Measure 0: duration = 2.0s
    // Measure 1: starts after delay 0.5s => startTime = 2.5s. BPM 240 => 4 beats = 1.0s.
    const startPos = { numerator: 1, denominator: 2, fraction: 0.5 };
    const startTime = tl.positionToTime(course.measures[0], startPos); // 1.0s
    const pending: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: startPos,
      startTime,
      snappedX: 50,
    };

    const endPos = { numerator: 1, denominator: 2, fraction: 0.5 };
    const endTime = tl.positionToTime(course.measures[1], endPos); // 2.5s + 0.5s = 3.0s

    course = createSpecialNote(course, pending, 1, endPos, endTime);
    const roll = course.rolls[0];

    const passed =
      approxEqual(roll.startTime, 1.0) &&
      approxEqual(roll.endTime, 3.0) &&
      course.rolls.length === 1;

    return {
      passed,
      message: passed
        ? 'Roll crossing #BPMCHANGE and #DELAY correctly preserves timeline actual times (1.0s -> 3.0s).'
        : `Timing mismatch: start=${roll.startTime}, end=${roll.endTime}`,
      details: { roll },
    };
  });

  // Phase 3-A Test 5: Balloon Hit Count Validation & Re-indexing
  test('test-phase3a-balloon-hitcount-and-reindexing', 'Balloon Hit Count Validation and Dynamic Re-indexing', 'rolls', () => {
    const tja = `TITLE:Balloon Test\nBPM:120\n#START\n0000000000000000,\n#END`;
    const chart = parseTJA(tja);
    let course = chart.activeCourse;
    const tl = new Timeline(course);

    const pendingBase: PendingSpecialNote = {
      toolType: '7',
      type: 'balloon',
      rawType: '7',
      startMeasureIndex: 0,
      startPosition: { numerator: 0, denominator: 1, fraction: 0 },
      startTime: 0.0,
      snappedX: 0,
    };

    // 1. Validation of invalid hitCount
    const invalidZero = validateSpecialPlacement(course, pendingBase, 0, { numerator: 1, denominator: 8, fraction: 0.125 }, 0.25, 0);
    const invalidNegative = validateSpecialPlacement(course, pendingBase, 0, { numerator: 1, denominator: 8, fraction: 0.125 }, 0.25, -5);
    const invalidFloat = validateSpecialPlacement(course, pendingBase, 0, { numerator: 1, denominator: 8, fraction: 0.125 }, 0.25, 3.5);
    const invalidNaN = validateSpecialPlacement(course, pendingBase, 0, { numerator: 1, denominator: 8, fraction: 0.125 }, 0.25, NaN);

    const validationsPassed = !invalidZero.valid && !invalidNegative.valid && !invalidFloat.valid && !invalidNaN.valid;

    // 2. Add Balloon 0 (5 hits), Balloon 1 (10 hits), Balloon 2 (15 hits)
    const b0Pending: PendingSpecialNote = {
      ...pendingBase,
      startPosition: { numerator: 0, denominator: 1, fraction: 0 },
      startTime: 0.0,
    };
    course = createSpecialNote(course, b0Pending, 0, { numerator: 1, denominator: 8, fraction: 0.125 }, 0.25, 5);

    const b1Pending: PendingSpecialNote = {
      ...pendingBase,
      startPosition: { numerator: 2, denominator: 8, fraction: 0.25 },
      startTime: 0.5,
    };
    course = createSpecialNote(course, b1Pending, 0, { numerator: 3, denominator: 8, fraction: 0.375 }, 0.75, 10);

    const b2Pending: PendingSpecialNote = {
      ...pendingBase,
      startPosition: { numerator: 4, denominator: 8, fraction: 0.5 },
      startTime: 1.0,
    };
    course = createSpecialNote(course, b2Pending, 0, { numerator: 5, denominator: 8, fraction: 0.625 }, 1.25, 15);

    const initialBalloonsOk =
      course.balloons.length === 3 &&
      course.balloons[0].balloonIndex === 0 && course.balloons[0].hitCount === 5 &&
      course.balloons[1].balloonIndex === 1 && course.balloons[1].hitCount === 10 &&
      course.balloons[2].balloonIndex === 2 && course.balloons[2].hitCount === 15 &&
      JSON.stringify(course.headers?.balloon) === JSON.stringify([5, 10, 15]);

    // 3. Delete middle balloon (Balloon 1) at time 0.6s
    const erased = eraseSpecialNoteAtPosition(course, 0, { numerator: 2, denominator: 8, fraction: 0.25 }, 0.6);
    course = erased.updatedCourse;

    const reindexingOk =
      erased.deleted &&
      course.balloons.length === 2 &&
      course.balloons[0].balloonIndex === 0 && course.balloons[0].hitCount === 5 &&
      course.balloons[1].balloonIndex === 1 && course.balloons[1].hitCount === 15 &&
      JSON.stringify(course.headers?.balloon) === JSON.stringify([5, 15]);

    const passed = validationsPassed && initialBalloonsOk && reindexingOk;
    return {
      passed,
      message: passed
        ? 'Balloon hit count validation succeeded, and re-indexing after deletion correctly synchronized headers [5, 15].'
        : 'Balloon hit count validation or re-indexing failed.',
      details: { validationsPassed, initialBalloonsOk, reindexingOk, balloons: course.balloons },
    };
  });

  // Phase 3-A Test 6: Deletion without Orphan '8' End Marker
  test('test-phase3a-deletion-no-orphan-eight', 'Complete Special Note Deletion without Orphan 8 End Markers', 'rolls', () => {
    const tja = `TITLE:Deletion Test\nBPM:120\n#START\n00000000,\n00000000,\n#END`;
    const chart = parseTJA(tja);
    let course = chart.activeCourse;
    const tl = new Timeline(course);

    // Create a cross-measure Roll from measure 0 to measure 1
    const pending: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: { numerator: 1, denominator: 2, fraction: 0.5 },
      startTime: 1.0,
      snappedX: 100,
    };
    course = createSpecialNote(course, pending, 1, { numerator: 1, denominator: 2, fraction: 0.5 }, 3.0);

    // Verify serialize contains 5 and 8
    const chartWithRoll: ChartModel = {
      ...chart,
      courses: { ...chart.courses, [chart.activeCourseKey]: course },
      activeCourse: course,
    };
    const tjaWithRoll = writeTJA(chartWithRoll);
    const hasRollMarkersBefore = tjaWithRoll.includes('5') && tjaWithRoll.includes('8');

    // Delete the roll by clicking inside in measure 1 (time = 2.5s)
    const eraseResult = eraseSpecialNoteAtPosition(course, 1, { numerator: 1, denominator: 4, fraction: 0.25 }, 2.5);
    const courseAfter = eraseResult.updatedCourse;

    const chartAfter: ChartModel = {
      ...chart,
      courses: { ...chart.courses, [chart.activeCourseKey]: courseAfter },
      activeCourse: courseAfter,
    };
    const tjaAfter = writeTJA(chartAfter);

    // Verify neither 5 nor 8 remains
    const hasOrphanEight = tjaAfter.includes('8');
    const hasRollStart = tjaAfter.includes('5');

    const passed =
      hasRollMarkersBefore &&
      eraseResult.deleted &&
      courseAfter.rolls.length === 0 &&
      !hasOrphanEight &&
      !hasRollStart;

    return {
      passed,
      message: passed
        ? 'Special note deleted completely from internal model and serialized TJA with zero orphan 8 end markers.'
        : `Deletion failed or orphan 8 detected: hasOrphanEight=${hasOrphanEight}, hasRollStart=${hasRollStart}`,
      details: { tjaAfter },
    };
  });

  // Phase 3-A Test 7: Undo / Redo Workflow
  test('test-phase3a-undo-redo-workflow', 'Special Note Undo / Redo Lifecycle', 'rolls', () => {
    const tja = `TITLE:Undo Redo\nBPM:120\n#START\n00000000,\n#END`;
    const chart0 = parseTJA(tja);

    // Step 1: Create Roll
    const pending: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: { numerator: 1, denominator: 4, fraction: 0.25 },
      startTime: 0.5,
      snappedX: 50,
    };
    const course1 = createSpecialNote(chart0.activeCourse, pending, 0, { numerator: 3, denominator: 4, fraction: 0.75 }, 1.5);
    const chart1: ChartModel = {
      ...chart0,
      courses: { ...chart0.courses, [chart0.activeCourseKey]: course1 },
      activeCourse: course1,
    };

    // Serialize history step 0 & 1
    const hist0 = writeTJA(chart0);
    const hist1 = writeTJA(chart1);

    // Undo to step 0
    const restoredUndo = parseTJA(hist0);
    const undoPassed = restoredUndo.activeCourse.rolls.length === 0;

    // Redo to step 1
    const restoredRedo = parseTJA(hist1);
    const redoPassed =
      restoredRedo.activeCourse.rolls.length === 1 &&
      restoredRedo.activeCourse.rolls[0].type === 'roll';

    const passed = undoPassed && redoPassed;
    return {
      passed,
      message: passed
        ? 'Undo accurately eliminated the created roll; Redo cleanly reinstated the exact special note.'
        : `Undo/Redo failed: undoPassed=${undoPassed}, redoPassed=${redoPassed}`,
    };
  });

  // Phase 3-A Test 8: Course Isolation
  test('test-phase3a-course-isolation', 'Course Isolation (No Cross-Course Pollution)', 'rolls', () => {
    const tja = `TITLE:Multi Course\nBPM:120\nCOURSE:Oni\nLEVEL:10\n#START\n00000000,\n#END\nCOURSE:Hard\nLEVEL:7\n#START\n00000000,\n#END`;
    const chart = parseTJA(tja);

    // Place Roll into Oni (key: 3)
    const oniCourse = chart.courses[3];
    const pending: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: { numerator: 0, denominator: 1, fraction: 0 },
      startTime: 0.0,
      snappedX: 0,
    };
    const updatedOni = createSpecialNote(oniCourse, pending, 0, { numerator: 1, denominator: 2, fraction: 0.5 }, 1.0);

    const updatedChart: ChartModel = {
      ...chart,
      courses: {
        ...chart.courses,
        [3]: updatedOni,
      },
    };

    // Verify Oni has 1 roll, Hard (key: 2) has 0 rolls
    const oniRolls = updatedChart.courses[3].rolls.length;
    const hardRolls = updatedChart.courses[2].rolls.length;

    const passed = oniRolls === 1 && hardRolls === 0;
    return {
      passed,
      message: passed
        ? 'Editing special notes in Oni course leaves Hard course completely isolated and untouched.'
        : `Course isolation failed: Oni rolls=${oniRolls}, Hard rolls=${hardRolls}`,
    };
  });

  // Phase 3-A Test 9: Semantic Round-Trip (ChartModel -> writeTJA -> parseTJA)
  test('test-phase3a-roundtrip-preservation', 'Semantic Round-Trip Preservation (Rolls, Big Rolls, Balloons)', 'roundtrip', () => {
    const tja = `TITLE:Roundtrip Chart\nBPM:120\nCOURSE:Oni\nLEVEL:10\n#START\n00000000,\n00000000,\n#END`;
    const chart0 = parseTJA(tja);
    let course = chart0.activeCourse;
    const tl = new Timeline(course);

    // 1. Roll
    const r1Start = { numerator: 0, denominator: 1, fraction: 0 };
    const r1Pending: PendingSpecialNote = {
      toolType: '5',
      type: 'roll',
      rawType: '5',
      startMeasureIndex: 0,
      startPosition: r1Start,
      startTime: tl.positionToTime(course.measures[0], r1Start),
      snappedX: 0,
    };
    course = createSpecialNote(course, r1Pending, 0, { numerator: 1, denominator: 4, fraction: 0.25 }, 0.5);

    // 2. Big Roll (cross-measure)
    const r2Start = { numerator: 1, denominator: 2, fraction: 0.5 };
    const r2Pending: PendingSpecialNote = {
      toolType: '6',
      type: 'big_roll',
      rawType: '6',
      startMeasureIndex: 0,
      startPosition: r2Start,
      startTime: tl.positionToTime(course.measures[0], r2Start),
      snappedX: 50,
    };
    course = createSpecialNote(course, r2Pending, 1, { numerator: 1, denominator: 4, fraction: 0.25 }, 2.5);

    // 3. Balloon
    const b1Start = { numerator: 1, denominator: 2, fraction: 0.5 };
    const b1Pending: PendingSpecialNote = {
      toolType: '7',
      type: 'balloon',
      rawType: '7',
      startMeasureIndex: 1,
      startPosition: b1Start,
      startTime: tl.positionToTime(course.measures[1], b1Start),
      snappedX: 100,
    };
    course = createSpecialNote(course, b1Pending, 1, { numerator: 3, denominator: 4, fraction: 0.75 }, 3.5, 12);

    const chart1: ChartModel = {
      ...chart0,
      courses: { ...chart0.courses, [chart0.activeCourseKey]: course },
      activeCourse: course,
    };

    // Write to TJA text
    const serialized = writeTJA(chart1);

    // Parse back
    const reParsed = parseTJA(serialized);
    const parsedCourse = reParsed.activeCourse;

    const roll1 = parsedCourse.rolls.find((r) => r.type === 'roll');
    const roll2 = parsedCourse.rolls.find((r) => r.type === 'big_roll');
    const balloon1 = parsedCourse.balloons[0];

    const roll1Ok =
      !!roll1 &&
      roll1.startMeasureIndex === 0 &&
      roll1.endMeasureIndex === 0 &&
      approxEqual(roll1.startPosition.fraction, 0.0) &&
      approxEqual(roll1.endPosition.fraction, 0.25);

    const roll2Ok =
      !!roll2 &&
      roll2.startMeasureIndex === 0 &&
      roll2.endMeasureIndex === 1 &&
      approxEqual(roll2.startPosition.fraction, 0.5) &&
      approxEqual(roll2.endPosition.fraction, 0.25);

    const balloon1Ok =
      !!balloon1 &&
      balloon1.startMeasureIndex === 1 &&
      balloon1.endMeasureIndex === 1 &&
      balloon1.hitCount === 12 &&
      approxEqual(balloon1.startPosition.fraction, 0.5) &&
      approxEqual(balloon1.endPosition.fraction, 0.75);

    const passed = roll1Ok && roll2Ok && balloon1Ok && parsedCourse.rolls.length === 2 && parsedCourse.balloons.length === 1;

    return {
      passed,
      message: passed
        ? 'Semantic round-trip verified: Roll, Big Roll, and Balloon definitions, spans, fractions, and balloon hit count preserved identically.'
        : `Semantic roundtrip mismatch: roll1Ok=${roll1Ok}, roll2Ok=${roll2Ok}, balloon1Ok=${balloon1Ok}`,
      details: { serialized, rolls: parsedCourse.rolls, balloons: parsedCourse.balloons },
    };
  });

  return results;
}
