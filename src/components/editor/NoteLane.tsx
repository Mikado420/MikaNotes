/**
 * MikaNotes Phase 2 - Note Lane
 * Visual editor canvas for Taiko notes, measure boundaries, and beat/subdivision grids.
 * Implements Don, Ka, Big Don, Big Ka, Rolls, Balloons, and End markers matching the design.
 */

import React from 'react';
import { CourseModel, NoteModel, RollModel, BalloonModel } from '../../core';
import { TimelineLayout, GridDivision } from '../../editor/editor-types';
import { getNoteX } from '../../editor/coordinate-mapping';

interface NoteLaneProps {
  course: CourseModel;
  layout: TimelineLayout;
  selectedGrid: GridDivision;
  onTapLane: (x: number) => void;
}

export const NoteLane: React.FC<NoteLaneProps> = ({
  course,
  layout,
  selectedGrid,
  onTapLane,
}) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    onTapLane(clickX);
  };

  const effectiveDiv = typeof selectedGrid === 'number' ? selectedGrid : 16;

  return (
    <div
      id="note-lane"
      onClick={handleClick}
      className="relative h-28 bg-[#0b111e] border-b border-slate-800/80 cursor-crosshair select-none overflow-hidden"
      style={{ width: `${layout.totalWidth}px` }}
    >
      {/* Center horizontal guideline */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-700/30 pointer-events-none" />

      {/* Grid lines (Measure boundaries, beat lines, and subdivision lines) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ width: `${layout.totalWidth}px`, height: '100%' }}
      >
        {layout.measures.map((m) => {
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

        {/* Render Rolls and Big Rolls as horizontal capsules / bands */}
        {course.rolls.map((roll, rIdx) => {
          const startMLayout = layout.measures[roll.startMeasureIndex];
          const endMLayout = layout.measures[roll.endMeasureIndex];
          if (!startMLayout || !endMLayout) return null;

          const startX = getNoteX(roll.startPosition, startMLayout);
          const endX = getNoteX(roll.endPosition, endMLayout);
          const width = Math.max(16, endX - startX);
          const isBig = roll.rawType === '6';
          const height = isBig ? 42 : 32;
          const y = 56 - height / 2;
          const color = isBig ? '#f97316' : '#eab308'; // Orange for Big Roll, Yellow for Roll

          return (
            <g key={`roll-${rIdx}`}>
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

        {/* Render Balloons */}
        {course.balloons.map((balloon, bIdx) => {
          const startMLayout = layout.measures[balloon.startMeasureIndex];
          const endMLayout = layout.measures[balloon.endMeasureIndex];
          if (!startMLayout || !endMLayout) return null;

          const startX = getNoteX(balloon.startPosition, startMLayout);
          const endX = getNoteX(balloon.endPosition, endMLayout);
          const width = Math.max(16, endX - startX);
          const height = 30;
          const y = 56 - height / 2;

          return (
            <g key={`balloon-${bIdx}`}>
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
            </g>
          );
        })}
      </svg>

      {/* Render Individual Notes matching reference image precisely */}
      {layout.measures.map((mLayout) => {
        return mLayout.measure.notes.map((note, nIdx) => {
          const noteX = getNoteX(note.positionInMeasure, mLayout);
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

      {/* Hexagonal End Markers (Note 8: roll/balloon end) as seen in reference image */}
      {layout.measures.map((mLayout) => {
        // Find if any events or roll ends exist in this measure
        const rollEndsInMeasure = course.rolls.filter(
          (r) => r.endMeasureIndex === mLayout.index
        );
        const balloonEndsInMeasure = course.balloons.filter(
          (b) => b.endMeasureIndex === mLayout.index
        );

        return [...rollEndsInMeasure, ...balloonEndsInMeasure].map((item, idx) => {
          const endX = getNoteX(item.endPosition, mLayout);
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
};
