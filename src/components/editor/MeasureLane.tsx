/**
 * MikaNotes Phase 2 - Measure (Time Signature) Lane
 * Displays time signatures (4/4, 3/4, 7/8) for each measure across the shared timeline.
 */

import React, { useMemo } from 'react';
import { TimelineLayout } from '../../editor/editor-types';
import { findVisibleMeasureLayouts } from '../../editor/coordinate-mapping';
import { useTimelineTap } from './use-timeline-tap';

interface MeasureLaneProps {
  layout: TimelineLayout;
  visibleStartX?: number;
  visibleEndX?: number;
  onTapLane?: (x: number) => void;
}

export const MeasureLane: React.FC<MeasureLaneProps> = ({
  layout,
  visibleStartX,
  visibleEndX,
  onTapLane,
}) => {
  const tapHandlers = useTimelineTap(onTapLane);

  const visibleMeasures = useMemo(() => {
    if (visibleStartX !== undefined && visibleEndX !== undefined) {
      return findVisibleMeasureLayouts(visibleStartX, visibleEndX, layout.measures);
    }
    return layout.measures;
  }, [layout.measures, visibleStartX, visibleEndX]);

  return (
    <div
      id="measure-lane"
      {...tapHandlers}
      className="relative h-6 bg-[#080d16] border-b border-slate-800 text-[11px] font-mono select-none overflow-hidden cursor-pointer touch-pan-x-scroll"
      style={{ width: `${layout.totalWidth}px`, touchAction: 'pan-x' }}
    >
      {/* Measure time signature labels */}
      {visibleMeasures.map((m) => {
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
