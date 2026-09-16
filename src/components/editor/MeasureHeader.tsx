/**
 * MikaNotes Phase 2 - Measure Header
 * Renders measure numbers (0, 1, 2... or offset) with highlighted active measure badge
 */

import React, { useMemo, useCallback } from 'react';
import { TimelineLayout } from '../../editor/editor-types';
import { findVisibleMeasureLayouts, findMeasureLayoutAtX } from '../../editor/coordinate-mapping';
import { useTimelineTap } from './use-timeline-tap';

interface MeasureHeaderProps {
  layout: TimelineLayout;
  activeMeasureIndex: number;
  onSelectMeasure?: (measureIndex: number) => void;
  visibleStartX?: number;
  visibleEndX?: number;
}

export const MeasureHeader: React.FC<MeasureHeaderProps> = ({
  layout,
  activeMeasureIndex,
  onSelectMeasure,
  visibleStartX,
  visibleEndX,
}) => {
  const visibleMeasures = useMemo(() => {
    if (visibleStartX !== undefined && visibleEndX !== undefined) {
      return findVisibleMeasureLayouts(visibleStartX, visibleEndX, layout.measures);
    }
    return layout.measures;
  }, [layout.measures, visibleStartX, visibleEndX]);

  const handleTap = useCallback(
    (timelineX: number) => {
      if (!onSelectMeasure) return;
      const measure = findMeasureLayoutAtX(timelineX, layout.measures);
      if (measure) {
        onSelectMeasure(measure.index);
      }
    },
    [onSelectMeasure, layout.measures]
  );

  const tapHandlers = useTimelineTap(handleTap);

  return (
    <div
      id="measure-header-lane"
      {...tapHandlers}
      className="relative h-6 bg-[#080d17] border-b border-slate-800 text-xs font-mono select-none flex cursor-pointer"
      style={{ width: `${layout.totalWidth}px` }}
    >
      {visibleMeasures.map((m) => {
        const isActive = m.index === activeMeasureIndex;

        return (
          <div
            key={m.index}
            id={`measure-header-${m.index}`}
            className={`absolute top-0 bottom-0 flex items-center border-l border-slate-700/60 pointer-events-none transition-colors ${
              isActive ? 'bg-blue-900/40' : 'hover:bg-slate-800/30'
            }`}
            style={{
              left: `${m.startX}px`,
              width: `${m.width}px`,
            }}
          >
            {/* Measure number badge */}
            <div
              className={`ml-2 px-1.5 py-0.5 rounded text-[11px] font-semibold leading-none ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m.index}
            </div>

            {/* Subtle progress indicator line inside active measure */}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500" />
            )}
          </div>
        );
      })}
    </div>
  );
};
