/**
 * MikaNotes TJA Core - Timeline Engine & Search API
 * Phase 1 / Phase 2 query API for time, beats, measures, notes, and events
 */

import { CourseModel, MeasureModel, NoteModel, RollModel, BalloonModel, CommandModel, RationalPosition } from './types';
import { approxEqual, EPSILON } from './math';

export class Timeline {
  private course: CourseModel;
  private sortedNotes: NoteModel[];
  private sortedEvents: CommandModel[];
  private sortedMeasures: MeasureModel[];

  constructor(course: CourseModel) {
    this.course = course;
    this.sortedNotes = [...course.notes].sort((a, b) => a.time - b.time);
    this.sortedEvents = [...course.events].sort((a, b) => a.time - b.time || a.sourceOrder - b.sourceOrder);
    this.sortedMeasures = [...course.measures].sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get the total duration of the course in seconds
   */
  public getDuration(): number {
    return this.course.duration;
  }

  /**
   * Get all measures
   */
  public getMeasures(): MeasureModel[] {
    return this.course.measures;
  }

  /**
   * Get all regular hit notes (1, 2, 3, 4)
   */
  public getNotes(): NoteModel[] {
    return this.sortedNotes;
  }

  /**
   * Get all rolls (5, 6)
   */
  public getRolls(): RollModel[] {
    return this.course.rolls;
  }

  /**
   * Get all balloons (7)
   */
  public getBalloons(): BalloonModel[] {
    return this.course.balloons;
  }

  /**
   * Get all events/commands
   */
  public getEvents(): CommandModel[] {
    return this.sortedEvents;
  }

  /**
   * Get measure at a specific time in seconds
   */
  public getMeasureAtTime(time: number): MeasureModel | null {
    if (this.sortedMeasures.length === 0) return null;
    if (time < this.sortedMeasures[0].startTime) return this.sortedMeasures[0];

    // Binary search for measure
    let low = 0;
    let high = this.sortedMeasures.length - 1;
    let result: MeasureModel | null = null;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const m = this.sortedMeasures[mid];
      if (time >= m.startTime - EPSILON && time < m.endTime - EPSILON) {
        return m;
      }
      if (time < m.startTime) {
        high = mid - 1;
      } else {
        result = m;
        low = mid + 1;
      }
    }

    return result || this.sortedMeasures[this.sortedMeasures.length - 1];
  }

  /**
   * Get measure by its zero-based index
   */
  public getMeasureByIndex(index: number): MeasureModel | null {
    if (index >= 0 && index < this.course.measures.length) {
      return this.course.measures[index];
    }
    return null;
  }

  /**
   * Get all notes within a time range [startTime, endTime] (inclusive)
   */
  public getNotesInRange(startTime: number, endTime: number): NoteModel[] {
    if (startTime > endTime) return [];
    const minT = startTime - EPSILON;
    const maxT = endTime + EPSILON;

    // Fast binary search to find start index
    let low = 0;
    let high = this.sortedNotes.length - 1;
    let startIdx = this.sortedNotes.length;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.sortedNotes[mid].time >= minT) {
        startIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const results: NoteModel[] = [];
    for (let i = startIdx; i < this.sortedNotes.length; i++) {
      const n = this.sortedNotes[i];
      if (n.time > maxT) break;
      results.push(n);
    }
    return results;
  }

  /**
   * Get all rolls and balloons active or overlapping within [startTime, endTime]
   */
  public getRollsInRange(startTime: number, endTime: number): (RollModel | BalloonModel)[] {
    const results: (RollModel | BalloonModel)[] = [];
    const all = [...this.course.rolls, ...this.course.balloons];

    for (const r of all) {
      if (r.endTime >= startTime - EPSILON && r.startTime <= endTime + EPSILON) {
        results.push(r);
      }
    }
    return results.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get events occurring at a specific time (with tolerance)
   */
  public getEventsAtTime(time: number, tolerance: number = 0.001): CommandModel[] {
    return this.sortedEvents.filter(e => Math.abs(e.time - time) <= tolerance);
  }

  /**
   * Check if Gogo Time is active at a given time
   */
  public getGogoStateAtTime(time: number): boolean {
    for (const range of this.course.gogoRanges) {
      if (time >= range.startTime - EPSILON && time < range.endTime - EPSILON) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the active BPM at a given time
   */
  public getBpmAtTime(time: number): number {
    let currentBpm = this.course.headers.bpm || 120;
    for (const e of this.sortedEvents) {
      if (e.name === 'BPMCHANGE' && e.time <= time + EPSILON) {
        const val = parseFloat(e.value);
        if (!isNaN(val) && val > 0) currentBpm = val;
      }
    }
    return currentBpm;
  }

  /**
   * Get active scroll speed at a given time
   */
  public getScrollAtTime(time: number): { scroll: number; scrollY: number } {
    let scroll = 1.0;
    let scrollY = 0.0;
    for (const e of this.sortedEvents) {
      if (e.name === 'SCROLL' && e.time <= time + EPSILON) {
        const parts = e.value.split(/\s+/);
        const s = parseFloat(parts[0]);
        if (!isNaN(s)) scroll = s;
        if (parts[1]) {
          const sy = parseFloat(parts[1]);
          if (!isNaN(sy)) scrollY = sy;
        }
      }
    }
    return { scroll, scrollY };
  }

  /**
   * Convert chart time (seconds) to beat position (quarter notes)
   */
  public timeToBeat(time: number): number {
    const measure = this.getMeasureAtTime(time);
    if (!measure) return 0;
    const pos = this.timeToPosition(measure, time);
    const beatsInMeasure = (measure.numerator / measure.denominator) * 4;
    return measure.startBeat + pos.fraction * beatsInMeasure;
  }

  /**
   * Convert beat position to chart time (seconds)
   */
  public beatToTime(beat: number): number {
    for (const m of this.sortedMeasures) {
      if (beat >= m.startBeat - EPSILON && beat <= m.endBeat + EPSILON) {
        const beatsInMeasure = (m.numerator / m.denominator) * 4;
        const progress = beatsInMeasure > 0 ? (beat - m.startBeat) / beatsInMeasure : 0;
        const clampedFrac = Math.max(0, Math.min(1, progress));
        const rational: RationalPosition = {
          numerator: Math.round(clampedFrac * 1920),
          denominator: 1920,
          fraction: clampedFrac,
        };
        return this.positionToTime(m, rational);
      }
    }
    // Fallback: estimate from last measure or 120 bpm
    if (this.sortedMeasures.length > 0) {
      const last = this.sortedMeasures[this.sortedMeasures.length - 1];
      const extraBeats = beat - last.endBeat;
      const bpm = this.getBpmAtTime(last.endTime);
      return last.endTime + (extraBeats / bpm) * 60;
    }
    return (beat / 120) * 60;
  }

  /**
   * Convert a RationalPosition within a measure to exact chart time (seconds),
   * correctly handling any #BPMCHANGE and #DELAY within the measure.
   */
  public positionToTime(measure: MeasureModel, position: RationalPosition): number {
    const targetFrac = position.denominator > 0
      ? position.numerator / position.denominator
      : (typeof position.fraction === 'number' ? position.fraction : 0);

    if (targetFrac <= EPSILON) {
      return measure.startTime;
    }

    const measureBeats = (measure.numerator * 4) / measure.denominator;

    // Collect all critical event points within this measure
    const segments = this.buildMeasureTimingSegments(measure);

    let accTime = 0;
    let prevFrac = 0;
    let currentBpm = segments.initialBpm;

    // If there is an initial DELAY at pos = 0
    const delayAtZero = segments.delays.get(0) || 0;
    accTime += delayAtZero;

    for (let i = 0; i < segments.points.length; i++) {
      const p = segments.points[i];
      if (p <= EPSILON) continue;

      if (targetFrac < p - EPSILON) {
        // Target is strictly between prevFrac and p
        const segFrac = targetFrac - prevFrac;
        const segBeats = segFrac * measureBeats;
        const segTime = currentBpm > 0 ? (segBeats / currentBpm) * 60 : 0;
        accTime += segTime;
        break;
      }

      // Progress through the full interval [prevFrac, p]
      const segFrac = p - prevFrac;
      const segBeats = segFrac * measureBeats;
      const segTime = currentBpm > 0 ? (segBeats / currentBpm) * 60 : 0;
      accTime += segTime;

      // When reaching point p:
      // 1. Add any DELAY occurring at point p
      const delayAtP = segments.delays.get(p) || 0;
      accTime += delayAtP;

      // 2. Update BPM if a BPMCHANGE occurs at point p
      if (segments.bpms.has(p)) {
        currentBpm = segments.bpms.get(p)!;
      }

      prevFrac = p;

      if (Math.abs(targetFrac - p) <= EPSILON) {
        break;
      }
    }

    return measure.startTime + accTime;
  }

  /**
   * Convert an exact chart time (seconds) to a RationalPosition within a measure,
   * correctly handling any #BPMCHANGE and #DELAY.
   */
  public timeToPosition(measure: MeasureModel, time: number): RationalPosition {
    if (time <= measure.startTime + EPSILON) {
      return { numerator: 0, denominator: 1, fraction: 0 };
    }
    if (time >= measure.endTime - EPSILON) {
      return { numerator: 1, denominator: 1, fraction: 1 };
    }

    const measureBeats = (measure.numerator * 4) / measure.denominator;
    const segments = this.buildMeasureTimingSegments(measure);

    let currTime = measure.startTime;
    let prevFrac = 0;
    let currentBpm = segments.initialBpm;

    // Check delay at position 0
    const delayAtZero = segments.delays.get(0) || 0;
    if (delayAtZero > 0 && time < currTime + delayAtZero) {
      return { numerator: 0, denominator: 1, fraction: 0 };
    }
    currTime += delayAtZero;

    for (let i = 0; i < segments.points.length; i++) {
      const p = segments.points[i];
      if (p <= EPSILON) continue;

      const segFrac = p - prevFrac;
      const segBeats = segFrac * measureBeats;
      const segTime = currentBpm > 0 ? (segBeats / currentBpm) * 60 : 0;

      if (time <= currTime + segTime + EPSILON) {
        // Target is inside [prevFrac, p]
        const dt = Math.max(0, time - currTime);
        const dBeats = (dt / 60) * currentBpm;
        const dFrac = measureBeats > 0 ? dBeats / measureBeats : 0;
        const frac = Math.max(0, Math.min(1, prevFrac + dFrac));
        return this.fractionToRational(measure, frac);
      }

      currTime += segTime;

      // Check DELAY at point p
      const delayAtP = segments.delays.get(p) || 0;
      if (delayAtP > 0) {
        if (time < currTime + delayAtP) {
          // Inside delay at point p
          return this.fractionToRational(measure, p);
        }
        currTime += delayAtP;
      }

      if (segments.bpms.has(p)) {
        currentBpm = segments.bpms.get(p)!;
      }

      prevFrac = p;
    }

    return { numerator: 1, denominator: 1, fraction: 1 };
  }

  /**
   * Helper: Build timing segments (BPMCHANGE and DELAY points) within a measure
   */
  private buildMeasureTimingSegments(measure: MeasureModel): {
    points: number[];
    initialBpm: number;
    bpms: Map<number, number>;
    delays: Map<number, number>;
  } {
    // Determine initial BPM of the measure
    let initialBpm = this.course.headers.bpm || 120;
    const priorEvents = this.sortedEvents.filter(
      (e) => e.name === 'BPMCHANGE' && e.time <= measure.startTime + EPSILON
    );
    if (priorEvents.length > 0) {
      const lastVal = parseFloat(priorEvents[priorEvents.length - 1].value);
      if (!isNaN(lastVal) && lastVal > 0) initialBpm = lastVal;
    }

    const bpms = new Map<number, number>();
    const delays = new Map<number, number>();
    const rawPoints = new Set<number>([0, 1]);

    for (const ev of measure.events) {
      const frac = ev.positionInMeasure.denominator > 0
        ? ev.positionInMeasure.numerator / ev.positionInMeasure.denominator
        : (ev.positionInMeasure.fraction ?? 0);
      const roundedFrac = Math.round(frac * 100000) / 100000;

      if (ev.name === 'BPMCHANGE') {
        const val = parseFloat(ev.value);
        if (!isNaN(val) && val > 0) {
          if (roundedFrac === 0) {
            initialBpm = val;
          } else {
            bpms.set(roundedFrac, val);
            rawPoints.add(roundedFrac);
          }
        }
      } else if (ev.name === 'DELAY') {
        const d = parseFloat(ev.value);
        if (!isNaN(d) && d > 0) {
          delays.set(roundedFrac, (delays.get(roundedFrac) || 0) + d);
          rawPoints.add(roundedFrac);
        }
      }
    }

    const sortedPoints = Array.from(rawPoints).sort((a, b) => a - b);

    return {
      points: sortedPoints,
      initialBpm,
      bpms,
      delays,
    };
  }

  /**
   * Helper: Convert a float fraction in a measure to a high-precision RationalPosition,
   * preferring matching notes/events or clean fractions.
   */
  private fractionToRational(measure: MeasureModel, fraction: number): RationalPosition {
    // 1. Check if matches any existing note in this measure
    for (const note of measure.notes) {
      const nFrac = note.positionInMeasure.denominator > 0
        ? note.positionInMeasure.numerator / note.positionInMeasure.denominator
        : note.positionInMeasure.fraction;
      if (Math.abs(nFrac - fraction) < 0.0001) {
        return {
          numerator: note.positionInMeasure.numerator,
          denominator: note.positionInMeasure.denominator,
          fraction: note.positionInMeasure.fraction,
        };
      }
    }

    // 2. Check if matches any existing event in this measure
    for (const ev of measure.events) {
      const eFrac = ev.positionInMeasure.denominator > 0
        ? ev.positionInMeasure.numerator / ev.positionInMeasure.denominator
        : ev.positionInMeasure.fraction;
      if (Math.abs(eFrac - fraction) < 0.0001) {
        return {
          numerator: ev.positionInMeasure.numerator,
          denominator: ev.positionInMeasure.denominator,
          fraction: ev.positionInMeasure.fraction,
        };
      }
    }

    // 3. Round to standard 1920 resolution
    const highRes = 1920;
    const step = Math.round(fraction * highRes);
    const clampedStep = Math.max(0, Math.min(highRes, step));

    // Calculate gcd to simplify
    let a = clampedStep;
    let b = highRes;
    while (b !== 0) {
      const t = b;
      b = a % b;
      a = t;
    }
    const g = a > 0 ? a : 1;

    return {
      numerator: clampedStep / g,
      denominator: highRes / g,
      fraction: clampedStep / highRes,
    };
  }
}
