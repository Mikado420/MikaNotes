/**
 * MikaNotes Phase 2 - BPM Lane
 * Visualizes tempo changes and markers across the shared timeline
 */

import React from 'react';
import { CourseModel, Timeline } from '../../core';
import { TimelineLayout } from '../../editor/editor-types';
import { timeToTimelineX } from '../../editor/coordinate-mapping';

interface BpmLaneProps {
  course: CourseModel;
  timeline: Timeline;
  layout: TimelineLayout;
}

export const BpmLane: React.FC<BpmLaneProps> = ({
  course,
  timeline,
  layout,
}) => {
  // Collect all BPM events and initial measure BPMs
  const bpmMarkers: { time: number; bpm: number; label: string }[] = [];

  // Initial BPM from header or measure 0
  const initialBpm = course.measures[0]?.initialBpm || 120;
  bpmMarkers.push({
    time: 0,
    bpm: initialBpm,
    label: Math.round(initialBpm).toString(),
  });

  // BPM change events from all measures
  for (const m of course.measures) {
    for (const ev of m.events) {
      if (ev.raw && ev.raw.toUpperCase().startsWith('#BPMCHANGE')) {
        const parts = ev.raw.trim().split(/\s+/);
        const val = parseFloat(parts[1]);
        if (!isNaN(val)) {
          // Avoid duplicate with initial at time 0
          if (Math.abs(ev.time - 0) > 0.001) {
            bpmMarkers.push({
              time: ev.time,
              bpm: val,
              label: Math.round(val).toString(),
            });
          }
        }
      }
    }
  }

  // Sort by time
  bpmMarkers.sort((a, b) => a.time - b.time);

  return (
    <div
      id="bpm-lane"
      className="relative h-7 bg-[#090e18] border-b border-slate-850 overflow-hidden select-none font-mono text-[10px]"
      style={{ width: `${layout.totalWidth}px` }}
    >
      {/* Background measure boundary lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ width: `${layout.totalWidth}px`, height: '100%' }}
      >
        {layout.measures.map((m) => (
          <line
            key={`bpm-m-${m.index}`}
            x1={m.startX}
            y1={0}
            x2={m.startX}
            y2="100%"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="1"
          />
        ))}

        {/* Continuous horizontal guide line */}
        <line
          x1={0}
          y1={14}
          x2={layout.totalWidth}
          y2={14}
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth="1"
        />
      </svg>

      {/* BPM Markers matching the reference image: label on top of white dot */}
      {bpmMarkers.map((marker, idx) => {
        const x = timeToTimelineX(marker.time, timeline, layout);

        return (
          <div
            key={`bpm-${idx}`}
            className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none"
            style={{ left: `${x}px` }}
          >
            {/* Numerical BPM label */}
            <span className="text-slate-200 font-semibold text-[10px] leading-tight select-none">
              {marker.label}
            </span>

            {/* White round dot marker */}
            <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)] mt-0.5" />
          </div>
        );
      })}
    </div>
  );
};
