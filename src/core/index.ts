/**
 * MikaNotes TJA Core - Main Entry Point
 * Complete chart data infrastructure for MikaNotes Phase 1 / Phase 2
 */

export * from './types';
export * from './math';
export * from './scanner';
export * from './validator';
export * from './timeline';
export * from './parser';
export * from './writer';

import { parseTJA } from './parser';
import { Timeline } from './timeline';
import { ChartModel } from './types';

/**
 * Convenient helper to parse TJA and immediately instantiate Timeline for active course
 */
export function createChartWithTimeline(tjaText: string) {
  const chart: ChartModel = parseTJA(tjaText);
  const timeline = new Timeline(chart.activeCourse);
  return {
    chart,
    timeline,
  };
}
