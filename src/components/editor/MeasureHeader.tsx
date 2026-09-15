/**
 * MikaNotes Phase 2 - Measure Header
 * Renders measure numbers (0, 1, 2... or offset) with highlighted active measure badge
 */

import React from 'react';
import { TimelineLayout } from '../../editor/editor-types';

interface MeasureHeaderProps {
  layout: TimelineLayout;
  activeMeasureIndex: number;
  onSelectMeasure?: (measureIndex: number) => void;
}

export const MeasureHeader: React.FC<MeasureHeaderProps> = ({
  layout,
  activeMeasureIndex,
  onSelectMeasure,
}) => {
  return (
    <div
      id="measure-header-lane"
      className="relative h-6 bg-[#080d17] border-b border-slate-800 text-xs font-mono select-none flex"
      style={{ width: `${layout.totalWidth}px` }}
    >
      {layout.measures.map((m) => {
        const isActive = m.index === activeMeasureIndex;

        return (
          <div
            key={m.index}
            id={`measure-header-${m.index}`}
            onClick={() => onSelectMeasure?.(m.index)}
            className={`absolute top-0 bottom-0 flex items-center border-l border-slate-700/60 cursor-pointer transition-colors ${
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
