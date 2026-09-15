/**
 * MikaNotes TJA Core - Writer
 * Reconstructs standard TJA text from ChartModel with full preservation
 */

import { ChartModel, CourseModel, MeasureModel, RationalPosition, WriterOptions } from './types';
import { calculateArrayLCM, formatBpm, gcd } from './math';

export function writeTJA(chart: ChartModel, options: WriterOptions = {}): string {
  const lines: string[] = [];

  // 1. Standard Headers
  const h = chart.headers;
  lines.push(`TITLE:${h.title || ''}`);
  if (h.subtitle) {
    lines.push(`SUBTITLE:--${h.subtitle}`);
  }
  lines.push(`BPM:${formatBpm(h.bpm || 120)}`);
  lines.push(`WAVE:${h.wave || ''}`);
  lines.push(`OFFSET:${(h.offset || 0).toFixed(3)}`);
  if (h.demostart) {
    lines.push(`DEMOSTART:${h.demostart.toFixed(3)}`);
  }

  // 2. Preserved / Custom Headers
  const emittedHeaderKeys = new Set(['TITLE', 'SUBTITLE', 'BPM', 'WAVE', 'OFFSET', 'DEMOSTART', 'COURSE', 'LEVEL', 'BALLOON']);
  if (h.rawHeaders) {
    for (const [key, val] of Object.entries(h.rawHeaders)) {
      if (!emittedHeaderKeys.has(key.toUpperCase())) {
        lines.push(`${key}:${val}`);
      }
    }
  }

  lines.push(''); // Blank line

  // 3. Courses
  const courseKeys = Object.keys(chart.courses).map(Number).sort((a, b) => a - b);
  for (const cKey of courseKeys) {
    const course = chart.courses[cKey];
    writeCourse(course, lines, h);
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

interface RollMarker {
  pos: RationalPosition;
  type: string;
}

interface RollEndMarker {
  pos: RationalPosition;
}

function writeCourse(course: CourseModel, lines: string[], globalHeaders: any) {
  lines.push(`COURSE:${course.courseName || 'Oni'}`);
  lines.push(`LEVEL:${course.headers?.level ?? 10}`);

  // Balloon header
  const balloons = course.balloons.map(b => b.hitCount);
  const headerBalloons = course.headers?.balloon || globalHeaders.balloon || [];
  const balloonListToUse = balloons.length > 0 ? balloons : headerBalloons;
  if (balloonListToUse.length > 0) {
    lines.push(`BALLOON:${balloonListToUse.join(',')}`);
  }

  lines.push('');
  lines.push('#START');

  // Track rolls and balloons by measure index using direct RationalPosition
  const rollStartsByMeasure = new Map<number, RollMarker[]>();
  const rollEndsByMeasure = new Map<number, RollEndMarker[]>();

  for (const r of course.rolls) {
    if (!rollStartsByMeasure.has(r.startMeasureIndex)) {
      rollStartsByMeasure.set(r.startMeasureIndex, []);
    }
    rollStartsByMeasure.get(r.startMeasureIndex)!.push({
      pos: r.startPosition,
      type: r.rawType,
    });

    if (!rollEndsByMeasure.has(r.endMeasureIndex)) {
      rollEndsByMeasure.set(r.endMeasureIndex, []);
    }
    rollEndsByMeasure.get(r.endMeasureIndex)!.push({
      pos: r.endPosition,
    });
  }

  for (const b of course.balloons) {
    if (!rollStartsByMeasure.has(b.startMeasureIndex)) {
      rollStartsByMeasure.set(b.startMeasureIndex, []);
    }
    rollStartsByMeasure.get(b.startMeasureIndex)!.push({
      pos: b.startPosition,
      type: '7',
    });

    if (!rollEndsByMeasure.has(b.endMeasureIndex)) {
      rollEndsByMeasure.set(b.endMeasureIndex, []);
    }
    rollEndsByMeasure.get(b.endMeasureIndex)!.push({
      pos: b.endPosition,
    });
  }

  // Iterate measures
  for (let mIdx = 0; mIdx < course.measures.length; mIdx++) {
    const measure = course.measures[mIdx];
    writeMeasure(measure, mIdx, lines, rollStartsByMeasure.get(mIdx) || [], rollEndsByMeasure.get(mIdx) || []);
  }

  lines.push('#END');
}

function writeMeasure(
  measure: MeasureModel,
  mIdx: number,
  lines: string[],
  rollStarts: RollMarker[],
  rollEnds: RollEndMarker[]
) {
  // Collect all rational denominators in this measure
  const denominators: number[] = [];

  if (measure.division && measure.division > 0) {
    denominators.push(measure.division);
  }

  for (const n of measure.notes) {
    if (n.positionInMeasure && n.positionInMeasure.denominator > 0) {
      denominators.push(n.positionInMeasure.denominator);
    }
  }

  for (const rs of rollStarts) {
    if (rs.pos && rs.pos.denominator > 0) {
      denominators.push(rs.pos.denominator);
    }
  }
  for (const re of rollEnds) {
    if (re.pos && re.pos.denominator > 0) {
      denominators.push(re.pos.denominator);
    }
  }

  for (const ev of measure.events) {
    if (ev.positionInMeasure && ev.positionInMeasure.denominator > 0) {
      denominators.push(ev.positionInMeasure.denominator);
    }
  }

  // Calculate division for this measure via LCM
  let division = measure.division || 1;
  if (denominators.length > 0) {
    division = calculateArrayLCM(denominators, 3840);
  }
  if (division <= 0 || !isFinite(division)) division = 1;

  // Build character array of length `division`
  const charArray: string[] = new Array(division).fill('0');

  // Place regular notes using Rational Position
  for (const n of measure.notes) {
    const idx = getRationalIndex(n.positionInMeasure, division, division - 1);
    charArray[idx] = n.type;
  }

  // Place roll starts using Rational Position
  for (const rs of rollStarts) {
    const idx = getRationalIndex(rs.pos, division, division - 1);
    charArray[idx] = rs.type;
  }

  // Place roll ends using Rational Position
  for (const re of rollEnds) {
    const idx = getRationalIndex(re.pos, division, division - 1);
    // If not overwritten by a note or if currently 0
    if (charArray[idx] === '0') {
      charArray[idx] = '8';
    } else if (['1', '2', '3', '4'].includes(charArray[idx])) {
      charArray[idx] = '8';
    }
  }

  // Group commands by note index using Rational Position
  // Commands positioned at division (i.e. at end before comma) go in commandsByNoteIndex[division]
  const commandsByNoteIndex: Record<number, string[]> = {};
  for (const ev of measure.events) {
    let notePos = 0;
    if (ev.positionInMeasure) {
      notePos = getRationalIndex(ev.positionInMeasure, division, division);
    }
    if (!commandsByNoteIndex[notePos]) commandsByNoteIndex[notePos] = [];
    commandsByNoteIndex[notePos].push(ev.raw);
  }

  // Check if measure has BARLINEOFF without explicit event
  if (!measure.barlineVisible && !measure.events.some(e => e.name === 'BARLINEOFF')) {
    if (!commandsByNoteIndex[0]) commandsByNoteIndex[0] = [];
    commandsByNoteIndex[0].unshift('#BARLINEOFF');
  }

  // Build measure string
  let measureStr = '';
  for (let i = 0; i < division; i++) {
    if (commandsByNoteIndex[i]) {
      for (const cmd of commandsByNoteIndex[i]) {
        if (measureStr.length > 0 && !measureStr.endsWith('\n')) {
          measureStr += '\n';
        }
        measureStr += cmd + '\n';
      }
    }
    measureStr += charArray[i];
  }

  // Trailing commands in measure (e.g. at end before comma)
  if (commandsByNoteIndex[division]) {
    for (const cmd of commandsByNoteIndex[division]) {
      if (measureStr.length > 0 && !measureStr.endsWith('\n')) {
        measureStr += '\n';
      }
      measureStr += cmd + '\n';
    }
  }

  measureStr += ',';
  lines.push(measureStr);
}

/**
 * Calculates the exact discrete note or event index within a measure using rational numbers.
 * Primary formula: index = Math.round((numerator * division) / denominator)
 * The numerator/denominator representation is treated as the primary truth.
 * Falls back to fraction * division only if denominator is non-positive or unavailable.
 */
function getRationalIndex(
  pos: RationalPosition | undefined,
  division: number,
  maxLimit: number
): number {
  if (!pos) return 0;
  if (
    typeof pos.numerator === 'number' &&
    typeof pos.denominator === 'number' &&
    pos.denominator > 0
  ) {
    const raw = (pos.numerator * division) / pos.denominator;
    const rounded = Math.round(raw);
    return Math.min(maxLimit, Math.max(0, rounded));
  }
  if (typeof pos.fraction === 'number' && !isNaN(pos.fraction)) {
    const rounded = Math.round(pos.fraction * division);
    return Math.min(maxLimit, Math.max(0, rounded));
  }
  return 0;
}
