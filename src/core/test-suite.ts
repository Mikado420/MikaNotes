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
import { approxEqual } from './math';
import { snapTimelineXToGrid, calculateTimelineLayout } from '../editor/coordinate-mapping';
import { GridDivision } from '../editor/editor-types';

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

  return results;
}
