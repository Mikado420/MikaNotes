/**
 * MikaNotes Phase 3-A - Roll / Big Roll / Balloon Visual Editing Logic
 * Provides pure validation, creation, and deletion helpers for special notes.
 */

import {
  BalloonModel,
  CourseModel,
  RationalPosition,
  RollModel,
  compareRationalPositions,
  isSameRationalPosition,
} from '../core';
import { NoteToolType } from './editor-types';

export interface PendingSpecialNote {
  toolType: '5' | '6' | '7';
  type: 'roll' | 'big_roll' | 'balloon';
  rawType: '5' | '6' | '7';
  startMeasureIndex: number;
  startPosition: RationalPosition;
  startTime: number;
  snappedX: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates the first tap (start position) for a special note.
 */
export function validateSpecialStart(
  course: CourseModel,
  measureIndex: number,
  rational: RationalPosition,
  time: number
): ValidationResult {
  const targetMeasure = course.measures[measureIndex];
  if (!targetMeasure) {
    return { valid: false, error: '小節が存在しません' };
  }

  // 1. Cannot place start on an existing regular note
  const hasNote = targetMeasure.notes.some((n) =>
    isSameRationalPosition(n.positionInMeasure, rational)
  );
  if (hasNote) {
    return { valid: false, error: '開始位置に既に音符が存在します' };
  }

  // 2. Cannot place start on any existing roll or balloon endpoint
  const allSpecial: (RollModel | BalloonModel)[] = [
    ...course.rolls,
    ...course.balloons,
  ];
  for (const item of allSpecial) {
    if (
      item.startMeasureIndex === measureIndex &&
      isSameRationalPosition(item.startPosition, rational)
    ) {
      return { valid: false, error: '既存の特殊音符の開始点と重複しています' };
    }
    if (
      item.endMeasureIndex === measureIndex &&
      isSameRationalPosition(item.endPosition, rational)
    ) {
      return { valid: false, error: '既存の特殊音符の終了点と重複しています' };
    }
  }

  // 3. Cannot start inside an existing roll/balloon range
  for (const item of allSpecial) {
    if (time > item.startTime + 1e-4 && time < item.endTime - 1e-4) {
      return { valid: false, error: '既存の特殊音符と区間が重複しています' };
    }
  }

  return { valid: true };
}

/**
 * Validates the second tap (end position) and balloon parameters.
 */
export function validateSpecialPlacement(
  course: CourseModel,
  pending: PendingSpecialNote,
  endMeasureIndex: number,
  endPosition: RationalPosition,
  endTime: number,
  balloonHitCount?: number
): ValidationResult {
  // 1. End position must strictly be after start position
  const isTimeOrderInvalid = endTime <= pending.startTime + 1e-5;
  const isMeasureOrderInvalid =
    endMeasureIndex < pending.startMeasureIndex ||
    (endMeasureIndex === pending.startMeasureIndex &&
      compareRationalPositions(endPosition, pending.startPosition) <= 0);

  if (isTimeOrderInvalid || isMeasureOrderInvalid) {
    return { valid: false, error: '終了位置は開始位置より後にしてください' };
  }

  const endMeasure = course.measures[endMeasureIndex];
  if (!endMeasure) {
    return { valid: false, error: '終了小節が存在しません' };
  }

  // 2. Cannot place end on an existing regular note
  const hasNoteAtEnd = endMeasure.notes.some((n) =>
    isSameRationalPosition(n.positionInMeasure, endPosition)
  );
  if (hasNoteAtEnd) {
    return { valid: false, error: '終了位置に既に音符が存在します' };
  }

  // Also re-verify start measure does not conflict with a regular note
  const startMeasure = course.measures[pending.startMeasureIndex];
  if (
    startMeasure &&
    startMeasure.notes.some((n) =>
      isSameRationalPosition(n.positionInMeasure, pending.startPosition)
    )
  ) {
    return { valid: false, error: '開始位置に既に音符が存在します' };
  }

  // Cannot enclose any existing regular notes inside the special note interval
  const hasEnclosedNotes = course.notes.some(
    (n) => n.time > pending.startTime + 1e-4 && n.time < endTime - 1e-4
  );
  if (hasEnclosedNotes) {
    return { valid: false, error: '区間内に通常音符が存在します' };
  }

  const allSpecial: (RollModel | BalloonModel)[] = [
    ...course.rolls,
    ...course.balloons,
  ];

  // 3. Endpoint collision: new start or end cannot match any existing start or end
  for (const item of allSpecial) {
    if (
      (item.startMeasureIndex === pending.startMeasureIndex &&
        isSameRationalPosition(item.startPosition, pending.startPosition)) ||
      (item.endMeasureIndex === pending.startMeasureIndex &&
        isSameRationalPosition(item.endPosition, pending.startPosition))
    ) {
      return { valid: false, error: '開始位置が既存の特殊音符の端点と重複しています' };
    }

    if (
      (item.startMeasureIndex === endMeasureIndex &&
        isSameRationalPosition(item.startPosition, endPosition)) ||
      (item.endMeasureIndex === endMeasureIndex &&
        isSameRationalPosition(item.endPosition, endPosition))
    ) {
      return { valid: false, error: '終了位置が既存の特殊音符の端点と重複しています' };
    }
  }

  // 4. Interval overlap: new interval [pending.startTime, endTime] must not overlap with existing [item.startTime, item.endTime]
  for (const item of allSpecial) {
    const overlap =
      Math.max(pending.startTime, item.startTime) <
      Math.min(endTime, item.endTime) - 1e-4;
    if (overlap) {
      return { valid: false, error: '既存の特殊音符と区間が重複しています' };
    }
  }

  // 5. Balloon hitCount validation
  if (pending.type === 'balloon') {
    if (
      typeof balloonHitCount !== 'number' ||
      !Number.isInteger(balloonHitCount) ||
      balloonHitCount <= 0 ||
      !isFinite(balloonHitCount)
    ) {
      return { valid: false, error: '打数は1以上の正の整数を指定してください' };
    }
  }

  return { valid: true };
}

/**
 * Creates and inserts a Roll, Big Roll, or Balloon into the CourseModel.
 * Ensures sequential balloonIndex and synchronization of BALLOON headers.
 */
export function createSpecialNote(
  course: CourseModel,
  pending: PendingSpecialNote,
  endMeasureIndex: number,
  endPosition: RationalPosition,
  endTime: number,
  balloonHitCount: number = 5,
  offset: number = 0,
  initialBpm: number = 120
): CourseModel {
  const startMeasure = course.measures[pending.startMeasureIndex];
  const endMeasure = course.measures[endMeasureIndex];

  const beatsInStartM = (startMeasure.numerator * 4) / startMeasure.denominator;
  const beatsInEndM = (endMeasure.numerator * 4) / endMeasure.denominator;

  const startBeat = startMeasure.startBeat + pending.startPosition.fraction * beatsInStartM;
  const endBeat = endMeasure.startBeat + endPosition.fraction * beatsInEndM;

  if (pending.type === 'balloon') {
    const newBalloon: BalloonModel = {
      id: `balloon-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'balloon',
      rawType: '7',
      startTime: pending.startTime,
      endTime,
      audioStartTime: pending.startTime - offset,
      audioEndTime: endTime - offset,
      startBeat,
      endBeat,
      startMeasureIndex: pending.startMeasureIndex,
      endMeasureIndex,
      startPosition: pending.startPosition,
      endPosition,
      hitCount: balloonHitCount,
      balloonIndex: 0,
      bpm: initialBpm,
      scroll: 1.0,
    };

    const updatedBalloons = [...course.balloons, newBalloon]
      .sort((a, b) => {
        if (a.startMeasureIndex !== b.startMeasureIndex) {
          return a.startMeasureIndex - b.startMeasureIndex;
        }
        return compareRationalPositions(a.startPosition, b.startPosition);
      })
      .map((b, idx) => ({ ...b, balloonIndex: idx }));

    const allSpecial = [...course.rolls, ...updatedBalloons];
    const updatedMeasures = course.measures.map((m) => ({
      ...m,
      rolls: allSpecial.filter(
        (r) => r.startMeasureIndex <= m.index && r.endMeasureIndex >= m.index
      ),
    }));

    return {
      ...course,
      measures: updatedMeasures,
      balloons: updatedBalloons,
      headers: {
        ...course.headers,
        balloon: updatedBalloons.map((b) => b.hitCount),
      },
    };
  } else {
    const newRoll: RollModel = {
      id: `roll-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: pending.type,
      rawType: pending.rawType as '5' | '6',
      startTime: pending.startTime,
      endTime,
      audioStartTime: pending.startTime - offset,
      audioEndTime: endTime - offset,
      startBeat,
      endBeat,
      startMeasureIndex: pending.startMeasureIndex,
      endMeasureIndex,
      startPosition: pending.startPosition,
      endPosition,
      bpm: initialBpm,
      scroll: 1.0,
    };

    const updatedRolls = [...course.rolls, newRoll].sort((a, b) => {
      if (a.startMeasureIndex !== b.startMeasureIndex) {
        return a.startMeasureIndex - b.startMeasureIndex;
      }
      return compareRationalPositions(a.startPosition, b.startPosition);
    });

    const allSpecial = [...updatedRolls, ...course.balloons];
    const updatedMeasures = course.measures.map((m) => ({
      ...m,
      rolls: allSpecial.filter(
        (r) => r.startMeasureIndex <= m.index && r.endMeasureIndex >= m.index
      ),
    }));

    return {
      ...course,
      measures: updatedMeasures,
      rolls: updatedRolls,
    };
  }
}

/**
 * Erases a Roll, Big Roll, or Balloon completely at the specified position/time.
 * If tapped on start marker, end marker, or anywhere in between, deletes the entire special note.
 */
export function eraseSpecialNoteAtPosition(
  course: CourseModel,
  measureIndex: number,
  rational: RationalPosition,
  time: number
): {
  updatedCourse: CourseModel;
  deleted: boolean;
  deletedType?: 'roll' | 'big_roll' | 'balloon';
} {
  // 1. Check Balloons
  const balloonIdx = course.balloons.findIndex((b) => {
    const isStart =
      b.startMeasureIndex === measureIndex &&
      isSameRationalPosition(b.startPosition, rational);
    const isEnd =
      b.endMeasureIndex === measureIndex &&
      isSameRationalPosition(b.endPosition, rational);
    const isInside = time >= b.startTime - 1e-4 && time <= b.endTime + 1e-4;
    return isStart || isEnd || isInside;
  });

  if (balloonIdx !== -1) {
    const updatedBalloons = course.balloons
      .filter((_, idx) => idx !== balloonIdx)
      .map((b, idx) => ({ ...b, balloonIndex: idx }));

    const allSpecial = [...course.rolls, ...updatedBalloons];
    const updatedMeasures = course.measures.map((m) => ({
      ...m,
      rolls: allSpecial.filter(
        (r) => r.startMeasureIndex <= m.index && r.endMeasureIndex >= m.index
      ),
    }));

    const updatedCourse: CourseModel = {
      ...course,
      measures: updatedMeasures,
      balloons: updatedBalloons,
      headers: {
        ...course.headers,
        balloon: updatedBalloons.map((b) => b.hitCount),
      },
    };

    return {
      updatedCourse,
      deleted: true,
      deletedType: 'balloon',
    };
  }

  // 2. Check Rolls
  const rollIdx = course.rolls.findIndex((r) => {
    const isStart =
      r.startMeasureIndex === measureIndex &&
      isSameRationalPosition(r.startPosition, rational);
    const isEnd =
      r.endMeasureIndex === measureIndex &&
      isSameRationalPosition(r.endPosition, rational);
    const isInside = time >= r.startTime - 1e-4 && time <= r.endTime + 1e-4;
    return isStart || isEnd || isInside;
  });

  if (rollIdx !== -1) {
    const targetRoll = course.rolls[rollIdx];
    const updatedRolls = course.rolls.filter((_, idx) => idx !== rollIdx);

    const allSpecial = [...updatedRolls, ...course.balloons];
    const updatedMeasures = course.measures.map((m) => ({
      ...m,
      rolls: allSpecial.filter(
        (r) => r.startMeasureIndex <= m.index && r.endMeasureIndex >= m.index
      ),
    }));

    const updatedCourse: CourseModel = {
      ...course,
      measures: updatedMeasures,
      rolls: updatedRolls,
    };

    return {
      updatedCourse,
      deleted: true,
      deletedType: targetRoll.type,
    };
  }

  return {
    updatedCourse: course,
    deleted: false,
  };
}
