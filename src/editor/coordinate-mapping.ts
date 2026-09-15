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

  for (let i = 0; i < course.measures.length; i++) {
    const m = course.measures[i];
    // Calculate effective beats in this measure based on time signature numerator/denominator
    // e.g. 4/4 = 4 beats, 3/4 = 3 beats, 7/8 = 3.5 beats
    const beats = (m.numerator * 4) / m.denominator;
    const width = Math.max(40, beats * beatWidth);

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

  // Find which measure contains this X
  for (const mLayout of layout.measures) {
    if (x >= mLayout.startX && x < mLayout.endX) {
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
  }

  return 0;
}

/**
 * Given a timeline X coordinate, find the target measure and snapped RationalPosition.
 */
export function snapTimelineXToGrid(
  x: number,
  timeline: Timeline,
  layout: TimelineLayout,
  gridDivision: GridDivision
): {
  measure: MeasureModel | null;
  measureIndex: number;
  snappedX: number;
  rational: RationalPosition;
  time: number;
} | null {
  if (layout.measures.length === 0) return null;

  // Find measure containing X (or nearest)
  let targetLayout: MeasureLayoutInfo | null = null;
  for (const m of layout.measures) {
    if (x >= m.startX && x < m.endX) {
      targetLayout = m;
      break;
    }
  }

  if (!targetLayout) {
    if (x < layout.measures[0].startX) {
      targetLayout = layout.measures[0];
    } else {
      targetLayout = layout.measures[layout.measures.length - 1];
    }
  }

  const relX = Math.max(0, Math.min(targetLayout.width, x - targetLayout.startX));
  const rawProgress = relX / targetLayout.width;

  const div = gridDivision;
  const step = Math.round(rawProgress * div);
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
