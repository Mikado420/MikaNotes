/**
 * MikaNotes Phase 2 - Measure (Time Signature) Lane
 * Displays time signatures (4/4, 3/4, 7/8) for each measure across the shared timeline.
 */

import React from 'react';
import { TimelineLayout } from '../../editor/editor-types';

interface MeasureLaneProps {
  layout: TimelineLayout;
}

export const MeasureLane: React.FC<MeasureLaneProps> = ({ layout }) => {
  return (
    <div
      id="measure-lane"
      className="relative h-6 bg-[#080d16] border-b border-slate-800 text-[11px] font-mono select-none overflow-hidden"
      style={{ width: `${layout.totalWidth}px` }}
    >
      {/* Measure time signature labels */}
      {layout.measures.map((m) => {
        const timeSig = `${m.measure.numerator}/${m.measure.denominator}`;

        return (
          <div
            key={`sig-${m.index}`}
            className="absolute top-0 bottom-0 flex items-center justify-center border-l border-slate-700/50 text-slate-400 font-medium"
            style={{
              left: `${m.startX}px`,
              width: `${m.width}px`,
            }}
          >
            <span>{timeSig}</span>
          </div>
        );
      })}
    </div>
  );
};
