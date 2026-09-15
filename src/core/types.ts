/**
 * MikaNotes TJA Core - Type Definitions
 * Phase 1: Chart Data Infrastructure
 */

export type NoteCharacter = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

export type NoteType = 'don' | 'ka' | 'big_don' | 'big_ka';

export type CourseKey = 0 | 1 | 2 | 3 | 4 | 'easy' | 'normal' | 'hard' | 'oni' | 'edit';

export interface RationalPosition {
  numerator: number;
  denominator: number;
  fraction: number; // numerator / denominator (0.0 to 1.0 within measure)
}

export interface NoteModel {
  id: string;
  type: '1' | '2' | '3' | '4'; // 1: Don, 2: Ka, 3: Big Don, 4: Big Ka
  kind: NoteType;
  time: number; // Chart time in seconds from #START (0-based)
  audioTime: number; // Audio time in seconds (time - offset)
  beat: number; // Beat position from #START (in quarter-note units)
  measureIndex: number;
  positionInMeasure: RationalPosition;
  bpm: number;
  scroll: number;
  scrollY?: number;
}

export interface RollModel {
  id: string;
  type: 'roll' | 'big_roll';
  rawType: '5' | '6';
  startTime: number;
  endTime: number;
  audioStartTime: number;
  audioEndTime: number;
  startBeat: number;
  endBeat: number;
  startMeasureIndex: number;
  endMeasureIndex: number;
  startPosition: RationalPosition;
  endPosition: RationalPosition;
  bpm: number;
  scroll: number;
}

export interface BalloonModel {
  id: string;
  type: 'balloon';
  rawType: '7';
  startTime: number;
  endTime: number;
  audioStartTime: number;
  audioEndTime: number;
  startBeat: number;
  endBeat: number;
  startMeasureIndex: number;
  endMeasureIndex: number;
  startPosition: RationalPosition;
  endPosition: RationalPosition;
  hitCount: number;
  balloonIndex: number;
  bpm: number;
  scroll: number;
}

export interface CommandModel {
  id: string;
  name: string; // e.g., 'BPMCHANGE', 'MEASURE', 'GOGOSTART', 'SCROLL', 'LYRIC', etc.
  value: string;
  parsedValue?: any;
  raw: string; // original line or inline token, e.g. "#BPMCHANGE 180"
  time: number;
  audioTime: number;
  beat: number;
  measureIndex: number;
  positionInMeasure: RationalPosition;
  sourceOrder: number; // tie-breaker for simultaneous events
  isSemantic: boolean; // whether the engine uses it for time/gogo/measure/etc.
}

export interface GogoRange {
  id: string;
  startTime: number;
  endTime: number;
  audioStartTime: number;
  audioEndTime: number;
  startBeat: number;
  endBeat: number;
  startMeasureIndex: number;
  endMeasureIndex: number;
}

export interface MeasureModel {
  index: number;
  startTime: number;
  endTime: number;
  audioStartTime: number;
  audioEndTime: number;
  startBeat: number;
  endBeat: number;
  numerator: number;
  denominator: number;
  ratio: number; // numerator / denominator
  duration: number; // in seconds
  barlineVisible: boolean;
  notes: NoteModel[];
  rolls: (RollModel | BalloonModel)[];
  events: CommandModel[];
  rawNoteString?: string;
  division?: number;
}

export interface TJAHeaderData {
  title: string;
  subtitle: string;
  bpm: number;
  wave: string;
  offset: number;
  demostart: number;
  level: number;
  course: string;
  balloon: number[];
  scoreMode?: number;
  maker?: string;
  genre?: string;
  side?: number;
  life?: number;
  game?: string;
  headScroll?: number;
  rawHeaders: Record<string, string>; // Complete preservation of original headers
}

export interface CourseModel {
  courseKey: number;
  courseName: string;
  headers: Record<string, any>;
  measures: MeasureModel[];
  notes: NoteModel[];
  rolls: RollModel[];
  balloons: BalloonModel[];
  events: CommandModel[];
  gogoRanges: GogoRange[];
  barlineTimes: number[];
  duration: number;
  maxCombo: number;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  code: string;
  message: string;
  line?: number;
  measureIndex?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ScanResult {
  charCount: number;
  lineCount: number;
  measureCount: number;
  notesCount: number;
  initialBpm: number;
  estimatedDuration: number | null;
  maxMeasureBeats: number;
  isHeavy: boolean;
  heavyReasons: string[];
}

export interface ChartModel {
  headers: TJAHeaderData;
  courses: Record<number, CourseModel>;
  activeCourseKey: number;
  activeCourse: CourseModel;
  scanInfo: ScanResult;
  validation: ValidationResult;
}

export interface ParseOptions {
  abortTimeoutMs?: number;
  courseKey?: number;
  defaultBpm?: number;
  defaultOffset?: number;
}

export interface WriterOptions {
  format?: 'standard' | 'compact';
  emitComments?: boolean;
}
