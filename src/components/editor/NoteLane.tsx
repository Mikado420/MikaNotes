/**
 * MikaNotes Phase 2 - Note Lane
 * Visual editor canvas for Taiko notes, measure boundaries, and beat/subdivision grids.
 * Implements Don, Ka, Big Don, Big Ka, Rolls, Balloons, and End markers matching the design.
 */

import React from 'react';
import { CourseModel, NoteModel, RollModel, BalloonModel } from '../../core';
import { TimelineLayout, GridDivision } from '../../editor/editor-types';
import { getNoteX, findVisibleMeasureLayouts } from '../../editor/coordinate-mapping';
import { PendingSpecialNote } from '../../editor/special-notes';
import { useTimelineTap } from './use-timeline-tap';

interface NoteLaneProps {
  course: CourseModel;
  layout: TimelineLayout;
  selectedGrid: GridDivision;
  onTapLane: (x: number) => void;
  visibleStartX?: number;
  visibleEndX?: number;
  pendingSpecialNote?: PendingSpecialNote | null;
}

export const NoteLane: React.FC<NoteLaneProps> = React.memo(({
  course,
  layout,
  selectedGrid,
  onTapLane,
  visibleStartX,
  visibleEndX,
  pendingSpecialNote,
}) => {
  const tapHandlers = useTimelineTap(onTapLane);

  const effectiveDiv = typeof selectedGrid === 'number' ? selectedGrid : 16;

  // Virtualization bounds (default to full width if not provided)
  const minVisibleX = visibleStartX ?? 0;
  const maxVisibleX = visibleEndX ?? layout.totalWidth;

  // Filter visible measures using O(log N) binary search range slice
  const visibleMeasures = React.useMemo(() => {
    return findVisibleMeasureLayouts(minVisibleX, maxVisibleX, layout.measures);
  }, [minVisibleX, maxVisibleX, layout.measures]);

  // Precompute roll pixel bounds memoized on course.rolls and layout.measures
  // Does NOT re-run during scrolling!
  const rollIntervals = React.useMemo(() => {
    if (course.rolls.length === 0) return { items: [], maxSpan: 0 };
    let maxSpan = 0;
    const items: { roll: RollModel; startX: number; endX: number; key: number }[] = [];
    for (let rIdx = 0; rIdx < course.rolls.length; rIdx++) {
      const roll = course.rolls[rIdx];
      const startMLayout = layout.measures[roll.startMeasureIndex];
      const endMLayout = layout.measures[roll.endMeasureIndex];
      if (!startMLayout || !endMLayout) continue;

      const startX = getNoteX(roll.startPosition, startMLayout);
      const endX = getNoteX(roll.endPosition, endMLayout);
      const span = Math.max(0, endX - startX);
      if (span > maxSpan) maxSpan = span;

      items.push({ roll, startX, endX, key: rIdx });
    }
    return { items, maxSpan };
  }, [course.rolls, layout.measures]);

  // Visible Rolls: fast interval intersection query
  // Supports cases where roll starts before visible window but spans across it
  const visibleRolls = React.useMemo(() => {
    const { items, maxSpan } = rollIntervals;
    if (items.length === 0) return [];

    const n = items.length;
    const thresholdStart = minVisibleX - maxSpan;

    // Binary search for first candidate roll whose startX >= thresholdStart
    let low = 0;
    let high = n - 1;
    let searchStart = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (items[mid].startX >= thresholdStart) {
        searchStart = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const results: { roll: RollModel; startX: number; endX: number; key: number }[] = [];
    for (let i = searchStart; i < n; i++) {
      const item = items[i];
      if (item.startX > maxVisibleX) {
        break; // Past right edge of viewport
      }
      if (item.startX <= maxVisibleX && item.endX >= minVisibleX) {
        results.push(item);
      }
    }
    return results;
  }, [rollIntervals, minVisibleX, maxVisibleX]);

  // Precompute balloon pixel bounds memoized on course.balloons and layout.measures
  const balloonIntervals = React.useMemo(() => {
    if (course.balloons.length === 0) return { items: [], maxSpan: 0 };
    let maxSpan = 0;
    const items: { balloon: BalloonModel; startX: number; endX: number; key: number }[] = [];
    for (let bIdx = 0; bIdx < course.balloons.length; bIdx++) {
      const balloon = course.balloons[bIdx];
      const startMLayout = layout.measures[balloon.startMeasureIndex];
      const endMLayout = layout.measures[balloon.endMeasureIndex];
      if (!startMLayout || !endMLayout) continue;

      const startX = getNoteX(balloon.startPosition, startMLayout);
      const endX = getNoteX(balloon.endPosition, endMLayout);
      const span = Math.max(0, endX - startX);
      if (span > maxSpan) maxSpan = span;

      items.push({ balloon, startX, endX, key: bIdx });
    }
    return { items, maxSpan };
  }, [course.balloons, layout.measures]);

  // Visible Balloons: fast interval intersection query
  const visibleBalloons = React.useMemo(() => {
    const { items, maxSpan } = balloonIntervals;
    if (items.length === 0) return [];

    const n = items.length;
    const thresholdStart = minVisibleX - maxSpan;

    // Binary search for first candidate balloon whose startX >= thresholdStart
    let low = 0;
    let high = n - 1;
    let searchStart = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (items[mid].startX >= thresholdStart) {
        searchStart = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const results: { balloon: BalloonModel; startX: number; endX: number; key: number }[] = [];
    for (let i = searchStart; i < n; i++) {
      const item = items[i];
      if (item.startX > maxVisibleX) {
        break; // Past right edge of viewport
      }
      if (item.startX <= maxVisibleX && item.endX >= minVisibleX) {
        results.push(item);
      }
    }
    return results;
  }, [balloonIntervals, minVisibleX, maxVisibleX]);

  // Map end markers by measureIndex for O(1) lookup during measure iteration
  const rollEndsByMeasure = React.useMemo(() => {
    const map = new Map<number, RollModel[]>();
    for (const r of course.rolls) {
      const list = map.get(r.endMeasureIndex);
      if (list) list.push(r);
      else map.set(r.endMeasureIndex, [r]);
    }
    return map;
  }, [course.rolls]);

  const balloonEndsByMeasure = React.useMemo(() => {
    const map = new Map<number, BalloonModel[]>();
    for (const b of course.balloons) {
      const list = map.get(b.endMeasureIndex);
      if (list) list.push(b);
      else map.set(b.endMeasureIndex, [b]);
    }
    return map;
  }, [course.balloons]);

  // Compute X coordinate of pending special note start position
  const pendingStartX = React.useMemo(() => {
    if (!pendingSpecialNote) return null;
    const mLayout = layout.measures[pendingSpecialNote.startMeasureIndex];
    if (!mLayout) return null;
    return getNoteX(pendingSpecialNote.startPosition, mLayout);
  }, [pendingSpecialNote, layout.measures]);

  return (
    <div
      id="note-lane"
      {...tapHandlers}
      className="relative h-28 bg-[#0b111e] border-b border-slate-800/80 cursor-crosshair select-none overflow-hidden touch-pan-x-scroll"
      style={{ width: `${layout.totalWidth}px`, touchAction: 'pan-x' }}
    >
      {/* Center horizontal guideline */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-700/30 pointer-events-none" />

      {/* Grid lines (Measure boundaries, beat lines, and subdivision lines for visible measures only) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ width: `${layout.totalWidth}px`, height: '100%' }}
      >
        {visibleMeasures.map((m) => {
          const lines = [];

          // 1. Measure boundary line (thick)
          lines.push(
            <line
              key={`m-bound-${m.index}`}
              x1={m.startX}
              y1={0}
              x2={m.startX}
              y2="100%"
              stroke="rgba(255, 255, 255, 0.45)"
              strokeWidth="2"
            />
          );

          // 2. Subdivision grid lines based on selected grid
          if (effectiveDiv > 1 && effectiveDiv <= 48) {
            const stepWidth = m.width / effectiveDiv;
            for (let s = 1; s < effectiveDiv; s++) {
              const subX = m.startX + s * stepWidth;
              // Check if this step is on a beat
              const isBeat = (s * m.beats) % effectiveDiv === 0;

              lines.push(
                <line
                  key={`m-${m.index}-sub-${s}`}
                  x1={subX}
                  y1={0}
                  x2={subX}
                  y2="100%"
                  stroke={isBeat ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.08)'}
                  strokeWidth={isBeat ? '1.2' : '0.8'}
                  strokeDasharray={isBeat ? undefined : '2 3'}
                />
              );
            }
          }

          return lines;
        })}

        {/* Render Rolls and Big Rolls as horizontal capsules / bands (visible only) */}
        {visibleRolls.map(({ roll, startX, endX, key }) => {
          const width = Math.max(16, endX - startX);
          const isBig = roll.rawType === '6';
          const height = isBig ? 42 : 32;
          const y = 56 - height / 2;
          const color = isBig ? '#f97316' : '#eab308'; // Orange for Big Roll, Yellow for Roll

          return (
            <g key={`roll-${key}`}>
              <rect
                x={startX}
                y={y}
                width={width}
                height={height}
                rx={height / 2}
                fill={color}
                fillOpacity="0.85"
                stroke="white"
                strokeWidth="2.5"
              />
            </g>
          );
        })}

        {/* Render Balloons (visible only) */}
        {visibleBalloons.map(({ balloon, startX, endX, key }) => {
          const width = Math.max(16, endX - startX);
          const height = 30;
          const y = 56 - height / 2;

          return (
            <g key={`balloon-${key}`}>
              <rect
                x={startX}
                y={y}
                width={width}
                height={height}
                rx={height / 2}
                fill="#ec4899"
                fillOpacity="0.75"
                stroke="white"
                strokeWidth="2"
              />
              {balloon.hitCount > 0 && width >= 26 && (
                <text
                  x={startX + 14}
                  y={56 + 4}
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                  textAnchor="middle"
                  className="select-none pointer-events-none"
                >
                  {balloon.hitCount}
                </text>
              )}
            </g>
          );
        })}

        {/* Render Pending Special Note Start Indicator */}
        {pendingStartX !== null && pendingSpecialNote && (
          <g key="pending-special-start">
            {/* Pulsing vertical guide line */}
            <line
              x1={pendingStartX}
              y1={0}
              x2={pendingStartX}
              y2={112}
              stroke={
                pendingSpecialNote.type === 'balloon'
                  ? '#f472b6'
                  : pendingSpecialNote.type === 'big_roll'
                  ? '#fb923c'
                  : '#facc15'
              }
              strokeWidth="2.5"
              strokeDasharray="4 3"
            />
            {/* Start circle indicator */}
            <circle
              cx={pendingStartX}
              cy={56}
              r={pendingSpecialNote.type === 'big_roll' ? 20 : 16}
              fill={
                pendingSpecialNote.type === 'balloon'
                  ? '#ec4899'
                  : pendingSpecialNote.type === 'big_roll'
                  ? '#f97316'
                  : '#eab308'
              }
              fillOpacity="0.9"
              stroke="white"
              strokeWidth="3"
            />
            {/* START text pill */}
            <rect
              x={pendingStartX - 22}
              y={6}
              width={44}
              height={18}
              rx={4}
              fill="#0f172a"
              fillOpacity="0.9"
              stroke={
                pendingSpecialNote.type === 'balloon'
                  ? '#ec4899'
                  : pendingSpecialNote.type === 'big_roll'
                  ? '#f97316'
                  : '#eab308'
              }
              strokeWidth="1.5"
            />
            <text
              x={pendingStartX}
              y={18}
              fill="white"
              fontSize="9"
              fontWeight="bold"
              textAnchor="middle"
              className="select-none pointer-events-none"
            >
              START
            </text>
          </g>
        )}
      </svg>

      {/* Render Individual Notes matching reference image precisely (visible measures only) */}
      {visibleMeasures.map((mLayout) => {
        return mLayout.measure.notes.map((note, nIdx) => {
          const noteX = getNoteX(note.positionInMeasure, mLayout);
          if (noteX < minVisibleX - 40 || noteX > maxVisibleX + 40) return null;

          const centerY = 56; // Half of 112px (h-28)

          // Distinguish note graphics:
          // 1: Don (red circle, white ring, black outline)
          // 2: Ka (blue circle, white ring, black outline)
          // 3: Big Don (larger red circle)
          // 4: Big Ka (larger blue circle)
          const isBig = note.type === '3' || note.type === '4';
          const isKa = note.type === '2' || note.type === '4';
          const radius = isBig ? 28 : 20;

          const fillColor = isKa ? '#38bdf8' : '#e63946'; // Cyan vs Crimson Red

          return (
            <div
              key={`note-${mLayout.index}-${nIdx}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform hover:scale-110"
              style={{
                left: `${noteX}px`,
                top: `${centerY}px`,
                width: `${radius * 2}px`,
                height: `${radius * 2}px`,
              }}
            >
              <svg width={radius * 2} height={radius * 2} viewBox="0 0 100 100">
                {/* Outer black edge */}
                <circle cx="50" cy="50" r="48" fill="#111827" />

                {/* Outer white ring */}
                <circle cx="50" cy="50" r="45" fill="white" />

                {/* Inner black thin separator */}
                <circle cx="50" cy="50" r="39" fill="#1e293b" />

                {/* Colored Core circle (Don red or Ka blue) */}
                <circle cx="50" cy="50" r="36" fill={fillColor} />

                {/* Additional inner concentric ring for Big Notes to emphasize weight */}
                {isBig && (
                  <circle
                    cx="50"
                    cy="50"
                    r="26"
                    fill="none"
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="4"
                  />
                )}
              </svg>
            </div>
          );
        });
      })}

      {/* Hexagonal End Markers (Note 8: roll/balloon end) as seen in reference image (visible measures only) */}
      {visibleMeasures.map((mLayout) => {
        // Fast O(1) retrieval of roll and balloon ends in this measure
        const rollEndsInMeasure = rollEndsByMeasure.get(mLayout.index) || [];
        const balloonEndsInMeasure = balloonEndsByMeasure.get(mLayout.index) || [];

        return [...rollEndsInMeasure, ...balloonEndsInMeasure].map((item, idx) => {
          const endX = getNoteX(item.endPosition, mLayout);
          if (endX < minVisibleX - 30 || endX > maxVisibleX + 30) return null;

          const centerY = 56;
          const hexSize = 14;

          return (
            <div
              key={`hex-${mLayout.index}-${idx}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${endX}px`,
                top: `${centerY}px`,
                width: `${hexSize * 2}px`,
                height: `${hexSize * 2}px`,
              }}
            >
              {/* Hexagon shape */}
              <svg width={hexSize * 2} height={hexSize * 2} viewBox="0 0 100 100">
                <polygon
                  points="50,5 90,25 90,75 50,95 10,75 10,25"
                  fill="#475569"
                  stroke="#94a3b8"
                  strokeWidth="6"
                />
              </svg>
            </div>
          );
        });
      })}
    </div>
  );
});

