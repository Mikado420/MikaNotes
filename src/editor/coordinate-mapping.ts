/**
 * MikaNotes Phase 2 - Coordinate Mapping
 * Precision dual-way coordinate transformation between screen/timeline X
 * and ChartModel timeline / measures / RationalPositions.
 */

import { CourseModel, MeasureModel, RationalPosition, Timeline } from '../core';
import { gcd } from '../core/math';
import { MeasureLayoutInfo, TimelineLayout, GridDivision } from './editor-types';

export const BASE_BEAT_WIDTH = 72; // Width of 1 beat (quarter note) in pixels at 100% zoom
export const LANE_PADDING_LEFT = 48; // Left offset for visual margin before Measure 0
export const MAX_MEASURE_WIDTH = 8000; // Visual Editor protection: clamp max measure display width

/**
 * Calculates the complete layout mapping for all measures in the course.
 */
export function calculateTimelineLayout(
  course: CourseModel,
  zoomPercent: number
): TimelineLayout {
  const zoomFactor = Math.max(0.2, zoomPercent / 100);
  const beatWidth = BASE_BEAT_WIDTH * zoomFactor;

  let currentX = LANE_PADDING_LEFT;
  const measureLayouts: MeasureLayoutInfo[] = [];

  // Visual Editor protection: clamp max measure display width to MAX_MEASURE_WIDTH
  // Prevents DOM/layout crashes on extreme #MEASURE (e.g. 99999999/1) while preserving Core exact data

  for (let i = 0; i < course.measures.length; i++) {
    const m = course.measures[i];
    // Calculate effective beats in this measure based on time signature numerator/denominator
    // e.g. 4/4 = 4 beats, 3/4 = 3 beats, 7/8 = 3.5 beats
    let beats = 4;
    if (m.denominator > 0 && isFinite(m.numerator) && isFinite(m.denominator)) {
      beats = (m.numerator * 4) / m.denominator;
    }
    if (isNaN(beats) || !isFinite(beats) || beats <= 0) {
      beats = 4;
    }

    const rawWidth = beats * beatWidth;
    const width = Math.min(MAX_MEASURE_WIDTH, Math.max(40, isFinite(rawWidth) ? rawWidth : 40));

    measureLayouts.push({
      index: i,
      measure: m,
      startX: currentX,
      width,
      endX: currentX + width,
      beats,
      startTime: m.startTime,
      duration: m.duration,
    });

    currentX += width;
  }

  // Add right padding for easy scrubbing
  const totalWidth = currentX + 300;

  return {
    totalWidth,
    measures: measureLayouts,
    baseBeatWidth: beatWidth,
    zoomFactor,
  };
}

/**
 * Binary search to find the MeasureLayoutInfo containing or nearest to timeline X coordinate.
 * Operates in O(log N) time complexity.
 */
export function findMeasureLayoutAtX(
  x: number,
  measures: MeasureLayoutInfo[]
): MeasureLayoutInfo | null {
  const n = measures.length;
  if (n === 0) return null;

  if (x < measures[0].startX) {
    return measures[0];
  }
  if (x >= measures[n - 1].endX) {
    return measures[n - 1];
  }

  let low = 0;
  let high = n - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const m = measures[mid];

    if (x < m.startX) {
      high = mid - 1;
    } else if (x >= m.endX) {
      low = mid + 1;
    } else {
      // x >= m.startX && x < m.endX
      return m;
    }
  }

  // Fallback boundary clamping
  return measures[Math.min(n - 1, Math.max(0, low))];
}

/**
 * Binary search to find the slice of visible MeasureLayoutInfo objects
 * intersecting [minX, maxX] in O(log N) time.
 */
export function findVisibleMeasureLayouts(
  minX: number,
  maxX: number,
  measures: MeasureLayoutInfo[]
): MeasureLayoutInfo[] {
  const n = measures.length;
  if (n === 0) return [];
  if (maxX < measures[0].startX || minX > measures[n - 1].endX) return [];

  // Find first measure where endX >= minX
  let low = 0;
  let high = n - 1;
  let startIdx = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (measures[mid].endX >= minX) {
      startIdx = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Find last measure where startX <= maxX
  low = startIdx;
  high = n - 1;
  let endIdx = n - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (measures[mid].startX <= maxX) {
      endIdx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (startIdx > endIdx) return [];
  return measures.slice(startIdx, endIdx + 1);
}

/**
 * Convert playback time in seconds to timeline X coordinate.
 */
export function timeToTimelineX(
  time: number,
  timeline: Timeline,
  layout: TimelineLayout
): number {
  if (layout.measures.length === 0) return LANE_PADDING_LEFT;

  // Find measure at time using Timeline's binary search
  const m = timeline.getMeasureAtTime(time);
  if (!m) {
    if (time <= 0) return layout.measures[0]?.startX ?? LANE_PADDING_LEFT;
    const last = layout.measures[layout.measures.length - 1];
    return last ? last.endX : LANE_PADDING_LEFT;
  }

  const mLayout = layout.measures[m.index];
  if (!mLayout) return LANE_PADDING_LEFT;

  // Accurately convert chart time to RationalPosition using Timeline
  const pos = timeline.timeToPosition(m, time);
  const progress = pos.denominator > 0 ? pos.numerator / pos.denominator : (pos.fraction ?? 0);
  const clampedProgress = Math.max(0, Math.min(1, progress));

  return mLayout.startX + clampedProgress * mLayout.width;
}

/**
 * Convert timeline X coordinate to playback time in seconds.
 */
export function timelineXToTime(
  x: number,
  timeline: Timeline,
  layout: TimelineLayout
): number {
  if (layout.measures.length === 0) return 0;

  const first = layout.measures[0];
  if (x <= first.startX) return first.startTime;

  const last = layout.measures[layout.measures.length - 1];
  if (x >= last.endX) return last.startTime + last.duration;

  // Find which measure contains this X via binary search O(log N)
  const mLayout = findMeasureLayoutAtX(x, layout.measures);
  if (!mLayout) return 0;

  const rawProgress = (x - mLayout.startX) / mLayout.width;
  const clampedProgress = Math.max(0, Math.min(1, rawProgress));

  // Construct RationalPosition for high precision
  const highRes = 1920;
  const step = Math.round(clampedProgress * highRes);
  const g = gcd(step, highRes);
  const rational: RationalPosition = {
    numerator: step / g,
    denominator: highRes / g,
    fraction: clampedProgress,
  };

  return timeline.positionToTime(mLayout.measure, rational);
}

/**
 * Given a timeline X coordinate, find the target measure and snapped RationalPosition.
 */
export function snapTimelineXToGrid(
  x: number,
  timeline: Timeline,
  layout: TimelineLayout,
  gridDivision: GridDivision,
  options?: { allowMeasureEnd?: boolean }
): {
  measure: MeasureModel | null;
  measureIndex: number;
  snappedX: number;
  rational: RationalPosition;
  time: number;
} | null {
  if (layout.measures.length === 0) return null;

  // Find measure containing X via binary search O(log N)
  const targetLayout = findMeasureLayoutAtX(x, layout.measures);
  if (!targetLayout) return null;

  const relX = Math.max(0, Math.min(targetLayout.width, x - targetLayout.startX));
  const rawProgress = relX / targetLayout.width;

  const div = gridDivision;
  const step = Math.round(rawProgress * div);

  // If allowMeasureEnd is requested (e.g. for roll/balloon end positions)
  if (options?.allowMeasureEnd && step === div) {
    if (targetLayout.index + 1 < layout.measures.length) {
      // Transition to start of the next measure (0/1)
      const nextLayout = layout.measures[targetLayout.index + 1];
      const rational: RationalPosition = {
        numerator: 0,
        denominator: 1,
        fraction: 0,
      };
      const time = timeline.positionToTime(nextLayout.measure, rational);
      return {
        measure: nextLayout.measure,
        measureIndex: nextLayout.index,
        snappedX: nextLayout.startX,
        rational,
        time,
      };
    }
  }

  const clampedStep = Math.min(div - 1, Math.max(0, step));
  const g = gcd(clampedStep, div);
  const numerator = clampedStep / g;
  const denominator = div / g;
  const fraction = numerator / denominator;

  const rational: RationalPosition = {
    numerator,
    denominator,
    fraction,
  };

  const snappedProgress = rational.fraction;
  const snappedX = targetLayout.startX + snappedProgress * targetLayout.width;

  // Accurately compute chart time using Timeline.positionToTime
  const time = timeline.positionToTime(targetLayout.measure, rational);

  return {
    measure: targetLayout.measure,
    measureIndex: targetLayout.index,
    snappedX,
    rational,
    time,
  };
}

/**
 * Calculates exact X coordinate of a note within a measure.
 */
export function getNoteX(
  notePos: RationalPosition,
  measureLayout: MeasureLayoutInfo
): number {
  let frac = 0;
  if (
    typeof notePos.numerator === 'number' &&
    typeof notePos.denominator === 'number' &&
    notePos.denominator > 0
  ) {
    frac = notePos.numerator / notePos.denominator;
  } else if (typeof notePos.fraction === 'number') {
    frac = notePos.fraction;
  }

  return measureLayout.startX + frac * measureLayout.width;
}
