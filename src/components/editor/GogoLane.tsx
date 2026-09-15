/**
 * MikaNotes Phase 2 - GOGO Lane
 * Renders Go-Go Time ranges as prominent golden bands on the timeline.
 */

import React from 'react';
import { CourseModel, Timeline } from '../../core';
import { TimelineLayout } from '../../editor/editor-types';
import { timeToTimelineX } from '../../editor/coordinate-mapping';

interface GogoLaneProps {
  course: CourseModel;
  timeline: Timeline;
  layout: TimelineLayout;
}

export const GogoLane: React.FC<GogoLaneProps> = ({
  course,
  timeline,
  layout,
}) => {
  return (
    <div
      id="gogo-lane"
      className="relative h-7 bg-[#090e19] border-b border-slate-800/80 overflow-hidden select-none"
      style={{ width: `${layout.totalWidth}px` }}
    >
      {/* Background measure boundary lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ width: `${layout.totalWidth}px`, height: '100%' }}
      >
        {layout.measures.map((m) => (
          <line
            key={`gogo-m-${m.index}`}
            x1={m.startX}
            y1={0}
            x2={m.startX}
            y2="100%"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1"
          />
        ))}

        {/* GoGo ranges as golden / amber luminous bands matching the reference image */}
        {course.gogoRanges.map((gogo, idx) => {
          const startX = timeToTimelineX(gogo.startTime, timeline, layout);
          const endX = timeToTimelineX(gogo.endTime, timeline, layout);
          const width = Math.max(12, endX - startX);

          return (
            <g key={`gogo-band-${idx}`}>
              <rect
                x={startX}
                y={4}
                width={width}
                height={20}
                rx={2}
                fill="#ca8a04"
                fillOpacity="0.45"
                stroke="#eab308"
                strokeWidth="1"
                strokeOpacity="0.7"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
