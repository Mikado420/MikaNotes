/**
 * MikaNotes Phase 2 - Editor Types
 */

import { ChartModel, CourseModel, MeasureModel, NoteModel, RationalPosition, Timeline } from '../core';

export type EditorTab = 'note' | 'gogo' | 'bpm' | 'measure';

export type NoteToolType =
  | '1' // ドン (Don)
  | '2' // カッ (Ka)
  | '3' // 大ドン (Big Don)
  | '4' // 大カッ (Big Ka)
  | '5' // 連打 (Roll)
  | '6' // 大連打 (Big Roll)
  | '7' // 風船 (Balloon)
  | 'erase'; // 消去

export type GridDivision = 4 | 8 | 12 | 16 | 20 | 24 | 32 | 48 | 'free';

export interface EditorUIState {
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  playbackSpeed: number;
  zoom: number; // Percentage, e.g. 155 = 155%
  scrollLeft: number;
  selectedTab: EditorTab;
  selectedNoteTool: NoteToolType;
  selectedGrid: GridDivision;
  customGridDiv: number;
  activeMeasureIndex: number;
  fileName: string;
  isDraggingPlayhead: boolean;
  selectedMeasureForEdit: number | null;
}

export interface MeasureLayoutInfo {
  index: number;
  measure: MeasureModel;
  startX: number;
  width: number;
  endX: number;
  beats: number;
  startTime: number;
  duration: number;
}

export interface TimelineLayout {
  totalWidth: number;
  measures: MeasureLayoutInfo[];
  baseBeatWidth: number;
  zoomFactor: number;
}
