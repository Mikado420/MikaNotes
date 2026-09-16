/**
 * MikaNotes TJA Core - Parser
 * High-precision parser with full preservation of metadata and commands
 */

import {
  ChartModel,
  CourseModel,
  MeasureModel,
  NoteModel,
  RollModel,
  BalloonModel,
  CommandModel,
  GogoRange,
  ParseOptions,
  TJAHeaderData,
  RationalPosition,
} from './types';
import { scanTJAInfo } from './scanner';
import { validateTJARaw } from './validator';
import { simplifyFraction } from './math';

export function parseTJA(tja: string, options: ParseOptions = {}): ChartModel {
  const timeoutMs = options.abortTimeoutMs ?? 2500;
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let loopCounter = 0;

  function checkTimeout() {
    if (loopCounter++ % 100 === 0) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - startTime > timeoutMs) {
        throw new Error(`HEAVY_CHART_ABORT: Parsing exceeded timeout of ${timeoutMs}ms.`);
      }
    }
  }

  // Pre-flight scan and raw validation
  const scanInfo = scanTJAInfo(tja);
  const validation = validateTJARaw(tja);

  // Parse lines
  const lines = tja.split(/\r?\n/);
  const headers: TJAHeaderData = {
    title: '',
    subtitle: '',
    bpm: options.defaultBpm ?? 120,
    wave: '',
    offset: options.defaultOffset ?? 0,
    demostart: 0,
    level: 0,
    course: 'Oni',
    balloon: [],
    rawHeaders: {},
  };

  const courseRawBlocks: { courseKey: number; courseName: string; lines: string[]; headers: Record<string, any> }[] = [];
  let currentCourseKey = 3;
  let currentCourseName = 'Oni';
  let currentCourseHeaders: Record<string, any> = {};
  let currentCourseLines: string[] = [];
  let inCourse = false;

  // First pass: collect headers and group courses
  for (let i = 0; i < lines.length; i++) {
    checkTimeout();
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Handle comments
    const lineWithoutComment = rawLine.split('//')[0].trim();
    if (!lineWithoutComment) continue;

    if (!inCourse) {
      if (lineWithoutComment.startsWith('COURSE:')) {
        const val = lineWithoutComment.substring(7).trim().toLowerCase();
        let key = 3;
        let name = 'Oni';
        if (val === 'easy' || val === '0') { key = 0; name = 'Easy'; }
        else if (val === 'normal' || val === '1') { key = 1; name = 'Normal'; }
        else if (val === 'hard' || val === '2') { key = 2; name = 'Hard'; }
        else if (val === 'oni' || val === '3') { key = 3; name = 'Oni'; }
        else if (val === 'edit' || val === '4') { key = 4; name = 'Edit'; }

        currentCourseKey = key;
        currentCourseName = name;
        currentCourseHeaders = { ...headers };
        currentCourseLines = [];
        inCourse = true;
      } else if (lineWithoutComment.startsWith('#START')) {
        // Direct start without COURSE header -> default to Oni
        currentCourseKey = 3;
        currentCourseName = 'Oni';
        currentCourseHeaders = { ...headers };
        currentCourseLines = [lineWithoutComment];
        inCourse = true;
      } else if (lineWithoutComment.includes(':')) {
        const colonIdx = lineWithoutComment.indexOf(':');
        const key = lineWithoutComment.substring(0, colonIdx).trim().toUpperCase();
        const value = lineWithoutComment.substring(colonIdx + 1).trim();

        headers.rawHeaders[key] = value;

        switch (key) {
          case 'TITLE': headers.title = value; break;
          case 'SUBTITLE': headers.subtitle = value.replace(/^--\s*/, '').replace(/^[+-]/, ''); break;
          case 'BPM': {
            const b = parseFloat(value);
            if (!isNaN(b) && isFinite(b) && b > 0) headers.bpm = b;
            break;
          }
          case 'WAVE': headers.wave = value; break;
          case 'OFFSET': {
            const o = parseFloat(value);
            if (!isNaN(o) && isFinite(o)) headers.offset = o;
            break;
          }
          case 'DEMOSTART': {
            const d = parseFloat(value);
            if (!isNaN(d) && isFinite(d)) headers.demostart = d;
            break;
          }
          case 'LEVEL': {
            const l = parseInt(value, 10);
            if (!isNaN(l)) headers.level = l;
            break;
          }
          case 'BALLOON': {
            headers.balloon = value.split(/[, ]+/).filter(Boolean).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
            break;
          }
          case 'SCOREMODE': headers.scoreMode = parseInt(value, 10) || 1; break;
          case 'MAKER': headers.maker = value; break;
          case 'GENRE': headers.genre = value; break;
          case 'SIDE': headers.side = parseInt(value, 10) || 3; break;
          case 'LIFE': headers.life = parseInt(value, 10); break;
          case 'GAME': headers.game = value; break;
          case 'HEADSCROLL': headers.headScroll = parseFloat(value) || 1.0; break;
        }
      }
    } else {
      if (lineWithoutComment.startsWith('COURSE:')) {
        // Save previous course
        if (currentCourseLines.length > 0) {
          courseRawBlocks.push({
            courseKey: currentCourseKey,
            courseName: currentCourseName,
            lines: currentCourseLines,
            headers: currentCourseHeaders,
          });
        }
        const val = lineWithoutComment.substring(7).trim().toLowerCase();
        let key = 3;
        let name = 'Oni';
        if (val === 'easy' || val === '0') { key = 0; name = 'Easy'; }
        else if (val === 'normal' || val === '1') { key = 1; name = 'Normal'; }
        else if (val === 'hard' || val === '2') { key = 2; name = 'Hard'; }
        else if (val === 'oni' || val === '3') { key = 3; name = 'Oni'; }
        else if (val === 'edit' || val === '4') { key = 4; name = 'Edit'; }

        currentCourseKey = key;
        currentCourseName = name;
        currentCourseHeaders = { ...headers };
        currentCourseLines = [];
      } else {
        // Check for course-specific headers before #START
        if (!currentCourseLines.some(l => l.startsWith('#START'))) {
          if (lineWithoutComment.startsWith('LEVEL:')) {
            currentCourseHeaders.level = parseInt(lineWithoutComment.substring(6).trim(), 10) || headers.level;
          } else if (lineWithoutComment.startsWith('BALLOON:')) {
            currentCourseHeaders.balloon = lineWithoutComment.substring(8).trim().split(/[, ]+/).filter(Boolean).map(v => parseInt(v, 10)).filter(v => !isNaN(v));
          }
        }
        currentCourseLines.push(lineWithoutComment);
      }
    }
  }

  if (currentCourseLines.length > 0) {
    courseRawBlocks.push({
      courseKey: currentCourseKey,
      courseName: currentCourseName,
      lines: currentCourseLines,
      headers: currentCourseHeaders,
    });
  }

  // If no course lines found at all, synthesize empty course
  if (courseRawBlocks.length === 0) {
    courseRawBlocks.push({
      courseKey: 3,
      courseName: 'Oni',
      lines: [],
      headers: { ...headers },
    });
  }

  // Second pass: Parse each course into CourseModel
  const courses: Record<number, CourseModel> = {};

  for (const block of courseRawBlocks) {
    checkTimeout();
    const courseModel = parseCourseContent(block, headers, checkTimeout);
    courses[block.courseKey] = courseModel;
  }

  const activeKey = options.courseKey ?? (courses[3] ? 3 : Number(Object.keys(courses)[0]));
  const activeCourse = courses[activeKey] || Object.values(courses)[0];

  return {
    headers,
    courses,
    activeCourseKey: activeKey,
    activeCourse,
    scanInfo,
    validation,
  };
}

/**
 * Parse an individual course's lines into structured CourseModel
 */
function parseCourseContent(
  block: { courseKey: number; courseName: string; lines: string[]; headers: Record<string, any> },
  globalHeaders: TJAHeaderData,
  checkTimeout: () => void
): CourseModel {
  let currentBpm = block.headers.bpm || globalHeaders.bpm || 120;
  let currentMeasureRatio = 1.0;
  let currentNumerator = 4;
  let currentDenominator = 4;
  let currentTime = 0.0; // Chart time from #START (0.000)
  let currentBeat = 0.0; // Quarter-note beat position from #START
  let currentScroll = 1.0;
  let currentScrollY = 0.0;
  let currentBarline = true;
  let isGogo = false;
  let currentGogoStart: { time: number; beat: number; measureIndex: number } | null = null;
  let sourceOrderCounter = 0;

  const balloonsList: number[] = block.headers.balloon && block.headers.balloon.length > 0
    ? block.headers.balloon
    : (globalHeaders.balloon || []);
  let balloonIndex = 0;

  const measures: MeasureModel[] = [];
  const notes: NoteModel[] = [];
  const rolls: RollModel[] = [];
  const balloons: BalloonModel[] = [];
  const events: CommandModel[] = [];
  const gogoRanges: GogoRange[] = [];
  const barlineTimes: number[] = [];

  let currentRoll: {
    type: 'roll' | 'big_roll' | 'balloon';
    rawType: '5' | '6' | '7';
    startTime: number;
    startBeat: number;
    startMeasureIndex: number;
    startPosition: RationalPosition;
    hitCount: number;
    balloonIndex: number;
    bpm: number;
    scroll: number;
  } | null = null;

  let inSong = false;
  let measureNotesBuf: string = '';
  let measureCommandsBuf: { commandStr: string; noteIndex: number; sourceOrder: number }[] = [];

  function closeActiveRoll(endTime: number, endBeat: number, endMeasureIndex: number, endPos: RationalPosition) {
    if (!currentRoll) return;

    if (currentRoll.type === 'balloon') {
      const balloon: BalloonModel = {
        id: `balloon-${balloons.length + 1}`,
        type: 'balloon',
        rawType: '7',
        startTime: currentRoll.startTime,
        endTime: Math.max(currentRoll.startTime, endTime),
        audioStartTime: currentRoll.startTime - globalHeaders.offset,
        audioEndTime: Math.max(currentRoll.startTime, endTime) - globalHeaders.offset,
        startBeat: currentRoll.startBeat,
        endBeat: Math.max(currentRoll.startBeat, endBeat),
        startMeasureIndex: currentRoll.startMeasureIndex,
        endMeasureIndex,
        startPosition: currentRoll.startPosition,
        endPosition: endPos,
        hitCount: currentRoll.hitCount,
        balloonIndex: currentRoll.balloonIndex,
        bpm: currentRoll.bpm,
        scroll: currentRoll.scroll,
      };
      balloons.push(balloon);
    } else {
      const roll: RollModel = {
        id: `roll-${rolls.length + 1}`,
        type: currentRoll.type,
        rawType: currentRoll.rawType as ('5' | '6'),
        startTime: currentRoll.startTime,
        endTime: Math.max(currentRoll.startTime, endTime),
        audioStartTime: currentRoll.startTime - globalHeaders.offset,
        audioEndTime: Math.max(currentRoll.startTime, endTime) - globalHeaders.offset,
        startBeat: currentRoll.startBeat,
        endBeat: Math.max(currentRoll.startBeat, endBeat),
        startMeasureIndex: currentRoll.startMeasureIndex,
        endMeasureIndex,
        startPosition: currentRoll.startPosition,
        endPosition: endPos,
        bpm: currentRoll.bpm,
        scroll: currentRoll.scroll,
      };
      rolls.push(roll);
    }

    currentRoll = null;
  }

  function executeCommand(cmdStr: string, noteIndex: number, totalNotesInMeasure: number, measureIdx: number) {
    checkTimeout();
    sourceOrderCounter++;
    const spaceIdx = cmdStr.indexOf(' ');
    const cmdName = (spaceIdx !== -1 ? cmdStr.substring(1, spaceIdx) : cmdStr.substring(1)).toUpperCase();
    const cmdVal = (spaceIdx !== -1 ? cmdStr.substring(spaceIdx + 1) : '').trim();

    const rationalPos: RationalPosition = totalNotesInMeasure > 0
      ? {
          numerator: noteIndex,
          denominator: totalNotesInMeasure,
          fraction: noteIndex / totalNotesInMeasure,
        }
      : { numerator: 0, denominator: 1, fraction: 0 };

    let isSemantic = true;

    switch (cmdName) {
      case 'BPMCHANGE': {
        const val = parseFloat(cmdVal);
        if (!isNaN(val) && isFinite(val) && val > 0) {
          currentBpm = val;
        }
        break;
      }
      case 'MEASURE': {
        const parts = cmdVal.split('/');
        if (parts.length === 2) {
          const num = parseFloat(parts[0]);
          const den = parseFloat(parts[1]);
          if (!isNaN(num) && !isNaN(den) && den > 0 && num > 0 && isFinite(num) && isFinite(den)) {
            currentNumerator = num;
            currentDenominator = den;
            currentMeasureRatio = num / den;
          } else {
            currentMeasureRatio = 1.0;
            currentNumerator = 4;
            currentDenominator = 4;
          }
        }
        break;
      }
      case 'DELAY': {
        const dVal = parseFloat(cmdVal);
        if (!isNaN(dVal) && isFinite(dVal)) {
          currentTime += dVal;
        }
        break;
      }
      case 'GOGOSTART': {
        if (!isGogo) {
          isGogo = true;
          currentGogoStart = { time: currentTime, beat: currentBeat, measureIndex: measureIdx };
        }
        break;
      }
      case 'GOGOEND': {
        if (isGogo && currentGogoStart) {
          isGogo = false;
          gogoRanges.push({
            id: `gogo-${gogoRanges.length + 1}`,
            startTime: currentGogoStart.time,
            endTime: currentTime,
            audioStartTime: currentGogoStart.time - globalHeaders.offset,
            audioEndTime: currentTime - globalHeaders.offset,
            startBeat: currentGogoStart.beat,
            endBeat: currentBeat,
            startMeasureIndex: currentGogoStart.measureIndex,
            endMeasureIndex: measureIdx,
          });
          currentGogoStart = null;
        }
        break;
      }
      case 'SCROLL': {
        const parts = cmdVal.split(/\s+/);
        const sVal = parseFloat(parts[0]);
        if (!isNaN(sVal)) currentScroll = sVal;
        if (parts[1]) {
          const syVal = parseFloat(parts[1]);
          if (!isNaN(syVal)) currentScrollY = syVal;
        }
        break;
      }
      case 'BARLINEON': {
        currentBarline = true;
        break;
      }
      case 'BARLINEOFF': {
        currentBarline = false;
        break;
      }
      default:
        isSemantic = false;
        break;
    }

    const eventModel: CommandModel = {
      id: `cmd-${events.length + 1}`,
      name: cmdName,
      value: cmdVal,
      raw: cmdStr,
      time: currentTime,
      audioTime: currentTime - globalHeaders.offset,
      beat: currentBeat,
      measureIndex: measureIdx,
      positionInMeasure: rationalPos,
      sourceOrder: sourceOrderCounter,
      isSemantic,
    };
    events.push(eventModel);
    return eventModel;
  }

  function commitMeasure(rawNotes: string, pendingCmds: { commandStr: string; noteIndex: number; sourceOrder: number }[]) {
    checkTimeout();
    const measureIndex = measures.length;
    const measureStartTime = currentTime;
    const measureStartBeat = currentBeat;

    if (currentBarline) {
      barlineTimes.push(measureStartTime);
    }

    const measureNotes: NoteModel[] = [];
    const measureEvents: CommandModel[] = [];
    let cmdPtr = 0;

    // Sort pending commands by noteIndex then sourceOrder
    pendingCmds.sort((a, b) => a.noteIndex - b.noteIndex || a.sourceOrder - b.sourceOrder);

    // Process all commands occurring at or before the start of the measure (noteIndex <= 0)
    // so that #MEASURE, #BPMCHANGE, #DELAY, #BARLINE apply to this measure
    while (cmdPtr < pendingCmds.length && pendingCmds[cmdPtr].noteIndex <= 0) {
      const ev = executeCommand(pendingCmds[cmdPtr].commandStr, 0, rawNotes.length, measureIndex);
      measureEvents.push(ev);
      cmdPtr++;
    }

    const noteCount = rawNotes.length > 0 ? rawNotes.length : 1;
    const measureBeats = 4.0 * currentMeasureRatio;
    const beatsPerStep = measureBeats / noteCount;

    for (let j = 0; j < (rawNotes.length > 0 ? rawNotes.length : 1); j++) {
      checkTimeout();

      // Process commands scheduled at this note position (for j > 0)
      while (cmdPtr < pendingCmds.length && pendingCmds[cmdPtr].noteIndex <= j) {
        const ev = executeCommand(pendingCmds[cmdPtr].commandStr, j, rawNotes.length, measureIndex);
        measureEvents.push(ev);
        cmdPtr++;
      }

      const char = rawNotes.length > 0 ? rawNotes[j] : '0';
      const charTime = currentTime;
      const charBeat = currentBeat;
      const { num, den } = simplifyFraction(j, rawNotes.length || 1);
      const rationalPos: RationalPosition = {
        numerator: num,
        denominator: den,
        fraction: rawNotes.length > 0 ? j / rawNotes.length : 0,
      };

      // Step time advancement
      const stepDuration = currentBpm > 0 ? (beatsPerStep / currentBpm) * 60.0 : 0;
      currentTime += stepDuration;
      currentBeat += beatsPerStep;

      // Handle note character
      switch (char) {
        case '0':
          break;
        case '1':
        case '2':
        case '3':
        case '4': {
          let kind: NoteModel['kind'] = 'don';
          if (char === '2') kind = 'ka';
          else if (char === '3') kind = 'big_don';
          else if (char === '4') kind = 'big_ka';

          const note: NoteModel = {
            id: `note-${notes.length + 1}`,
            type: char as ('1' | '2' | '3' | '4'),
            kind,
            time: charTime,
            audioTime: charTime - globalHeaders.offset,
            beat: charBeat,
            measureIndex,
            positionInMeasure: rationalPos,
            bpm: currentBpm,
            scroll: currentScroll,
            scrollY: currentScrollY,
          };
          notes.push(note);
          measureNotes.push(note);
          break;
        }
        case '5':
        case '6': {
          // If previous roll is unclosed, close it
          if (currentRoll) {
            closeActiveRoll(charTime, charBeat, measureIndex, rationalPos);
          }
          currentRoll = {
            type: char === '5' ? 'roll' : 'big_roll',
            rawType: char as ('5' | '6'),
            startTime: charTime,
            startBeat: charBeat,
            startMeasureIndex: measureIndex,
            startPosition: rationalPos,
            hitCount: 0,
            balloonIndex: -1,
            bpm: currentBpm,
            scroll: currentScroll,
          };
          break;
        }
        case '7': {
          if (currentRoll) {
            closeActiveRoll(charTime, charBeat, measureIndex, rationalPos);
          }
          const hitCount = balloonsList.length > 0
            ? balloonsList[Math.min(balloonIndex, balloonsList.length - 1)] || 5
            : 5;
          currentRoll = {
            type: 'balloon',
            rawType: '7',
            startTime: charTime,
            startBeat: charBeat,
            startMeasureIndex: measureIndex,
            startPosition: rationalPos,
            hitCount,
            balloonIndex,
            bpm: currentBpm,
            scroll: currentScroll,
          };
          balloonIndex++;
          break;
        }
        case '8': {
          if (currentRoll) {
            closeActiveRoll(charTime, charBeat, measureIndex, rationalPos);
          }
          break;
        }
      }
    }

    // Process any trailing commands in this measure
    while (cmdPtr < pendingCmds.length) {
      const ev = executeCommand(pendingCmds[cmdPtr].commandStr, rawNotes.length, rawNotes.length, measureIndex);
      measureEvents.push(ev);
      cmdPtr++;
    }

    const measureEndTime = currentTime;
    const measureEndBeat = currentBeat;

    const measure: MeasureModel = {
      index: measureIndex,
      startTime: measureStartTime,
      endTime: measureEndTime,
      audioStartTime: measureStartTime - globalHeaders.offset,
      audioEndTime: measureEndTime - globalHeaders.offset,
      startBeat: measureStartBeat,
      endBeat: measureEndBeat,
      numerator: currentNumerator,
      denominator: currentDenominator,
      ratio: currentMeasureRatio,
      duration: Math.max(0, measureEndTime - measureStartTime),
      barlineVisible: currentBarline,
      notes: measureNotes,
      rolls: [], // will be linked or queried
      events: measureEvents,
      rawNoteString: rawNotes,
      division: rawNotes.length > 0 ? rawNotes.length : 1,
    };

    measures.push(measure);
  }

  // Iterate lines of this course
  for (let l = 0; l < block.lines.length; l++) {
    checkTimeout();
    const line = block.lines[l].trim();
    if (!line) continue;

    if (!inSong) {
      if (line === '#START') {
        inSong = true;
        measureNotesBuf = '';
        measureCommandsBuf = [];
      }
    } else {
      if (line === '#END') {
        if (measureNotesBuf.length > 0 || measureCommandsBuf.length > 0) {
          commitMeasure(measureNotesBuf, measureCommandsBuf);
          measureNotesBuf = '';
          measureCommandsBuf = [];
        }
        if (currentRoll) {
          closeActiveRoll(currentTime, currentBeat, measures.length - 1, { numerator: 1, denominator: 1, fraction: 1 });
        }
        if (isGogo && currentGogoStart) {
          gogoRanges.push({
            id: `gogo-${gogoRanges.length + 1}`,
            startTime: currentGogoStart.time,
            endTime: currentTime,
            audioStartTime: currentGogoStart.time - globalHeaders.offset,
            audioEndTime: currentTime - globalHeaders.offset,
            startBeat: currentGogoStart.beat,
            endBeat: currentBeat,
            startMeasureIndex: currentGogoStart.measureIndex,
            endMeasureIndex: Math.max(0, measures.length - 1),
          });
          currentGogoStart = null;
          isGogo = false;
        }
        inSong = false;
        break;
      }

      if (line.startsWith('#')) {
        if (measureNotesBuf.length === 0 && measureCommandsBuf.length === 0) {
          // Command outside or at the start of measure
          sourceOrderCounter++;
          measureCommandsBuf.push({
            commandStr: line,
            noteIndex: 0,
            sourceOrder: sourceOrderCounter,
          });
        } else {
          sourceOrderCounter++;
          measureCommandsBuf.push({
            commandStr: line,
            noteIndex: measureNotesBuf.length,
            sourceOrder: sourceOrderCounter,
          });
        }
      } else {
        // Line containing notes, commas, or embedded commands
        let idx = 0;
        while (idx < line.length) {
          checkTimeout();
          const char = line[idx];
          if (char === '#') {
            let cmdEnd = idx + 1;
            while (cmdEnd < line.length && line[cmdEnd] !== '#' && line[cmdEnd] !== ',') {
              cmdEnd++;
            }
            const cmdToken = line.substring(idx, cmdEnd).trim();
            sourceOrderCounter++;
            measureCommandsBuf.push({
              commandStr: cmdToken,
              noteIndex: measureNotesBuf.length,
              sourceOrder: sourceOrderCounter,
            });
            idx = cmdEnd;
          } else if (char === ',') {
            commitMeasure(measureNotesBuf, measureCommandsBuf);
            measureNotesBuf = '';
            measureCommandsBuf = [];
            idx++;
          } else if (char >= '0' && char <= '8') {
            measureNotesBuf += char;
            idx++;
          } else {
            idx++;
          }
        }
      }
    }
  }

  // If chart ended without explicit #END
  if (inSong && (measureNotesBuf.length > 0 || measureCommandsBuf.length > 0)) {
    commitMeasure(measureNotesBuf, measureCommandsBuf);
  }
  if (currentRoll) {
    closeActiveRoll(currentTime, currentBeat, Math.max(0, measures.length - 1), { numerator: 1, denominator: 1, fraction: 1 });
  }

  // Populate measure.rolls for all measures with any rolls or balloons spanning them
  const allSpecial = [...rolls, ...balloons];
  for (const m of measures) {
    m.rolls = allSpecial.filter(
      (r) => r.startMeasureIndex <= m.index && r.endMeasureIndex >= m.index
    );
  }

  // Calculate final duration and combo
  const totalDuration = notes.length > 0
    ? notes.reduce((max, n) => Math.max(max, n.time), currentTime)
    : currentTime;

  return {
    courseKey: block.courseKey,
    courseName: block.courseName,
    headers: block.headers,
    measures,
    notes,
    rolls,
    balloons,
    events,
    gogoRanges,
    barlineTimes,
    duration: totalDuration,
    maxCombo: notes.length,
  };
}
