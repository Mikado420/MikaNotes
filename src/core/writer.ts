/**
 * MikaNotes TJA Core - Writer
 * Reconstructs standard TJA text from ChartModel with full preservation
 */

import { ChartModel, CourseModel, MeasureModel, WriterOptions } from './types';
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

  // Track rolls and balloons by measure index
  const rollStartsByMeasure = new Map<number, { pos: number; type: string }[]>();
  const rollEndsByMeasure = new Map<number, { pos: number }[]>();

  for (const r of course.rolls) {
    if (!rollStartsByMeasure.has(r.startMeasureIndex)) {
      rollStartsByMeasure.set(r.startMeasureIndex, []);
    }
    rollStartsByMeasure.get(r.startMeasureIndex)!.push({
      pos: r.startPosition.fraction,
      type: r.rawType,
    });

    if (!rollEndsByMeasure.has(r.endMeasureIndex)) {
      rollEndsByMeasure.set(r.endMeasureIndex, []);
    }
    rollEndsByMeasure.get(r.endMeasureIndex)!.push({
      pos: r.endPosition.fraction,
    });
  }

  for (const b of course.balloons) {
    if (!rollStartsByMeasure.has(b.startMeasureIndex)) {
      rollStartsByMeasure.set(b.startMeasureIndex, []);
    }
    rollStartsByMeasure.get(b.startMeasureIndex)!.push({
      pos: b.startPosition.fraction,
      type: '7',
    });

    if (!rollEndsByMeasure.has(b.endMeasureIndex)) {
      rollEndsByMeasure.set(b.endMeasureIndex, []);
    }
    rollEndsByMeasure.get(b.endMeasureIndex)!.push({
      pos: b.endPosition.fraction,
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
  rollStarts: { pos: number; type: string }[],
  rollEnds: { pos: number }[]
) {
  // If the measure had an explicit raw string and it matches division, use it as initial base
  // Otherwise calculate optimal division using LCM
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
    denominators.push(getFractionDenominator(rs.pos));
  }
  for (const re of rollEnds) {
    denominators.push(getFractionDenominator(re.pos));
  }

  // Calculate division for this measure
  let division = measure.division || 1;
  if (denominators.length > 0) {
    division = calculateArrayLCM(denominators, 3840);
  }
  if (division <= 0 || !isFinite(division)) division = 1;

  // Build character array of length `division`
  const charArray: string[] = new Array(division).fill('0');

  // Place regular notes
  for (const n of measure.notes) {
    const idx = Math.min(division - 1, Math.max(0, Math.round(n.positionInMeasure.fraction * division)));
    charArray[idx] = n.type;
  }

  // Place roll starts
  for (const rs of rollStarts) {
    const idx = Math.min(division - 1, Math.max(0, Math.round(rs.pos * division)));
    charArray[idx] = rs.type;
  }

  // Place roll ends
  for (const re of rollEnds) {
    const idx = Math.min(division - 1, Math.max(0, Math.round(re.pos * division)));
    // If not overwritten by a note or if currently 0
    if (charArray[idx] === '0') {
      charArray[idx] = '8';
    } else if (['1', '2', '3', '4'].includes(charArray[idx])) {
      charArray[idx] = '8';
    }
  }

  // Group commands by note index
  // Commands with fraction 0 or at start belong at beginning of measure
  const commandsByNoteIndex: Record<number, string[]> = {};
  for (const ev of measure.events) {
    let notePos = 0;
    if (ev.positionInMeasure && ev.positionInMeasure.fraction > 0) {
      notePos = Math.min(division, Math.max(0, Math.round(ev.positionInMeasure.fraction * division)));
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

function getFractionDenominator(fraction: number, maxDenominator: number = 64): number {
  if (fraction <= 0 || fraction >= 1) return 1;
  let bestDenom = 1;
  let minError = 1.0;

  for (let d = 1; d <= maxDenominator; d++) {
    const error = Math.abs(fraction - Math.round(fraction * d) / d);
    if (error < minError) {
      minError = error;
      bestDenom = d;
      if (error < 1e-6) break;
    }
  }
  return bestDenom;
}
