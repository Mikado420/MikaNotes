/**
 * MikaNotes - Grid Selector
 * Allows switching between fixed grid divisions:
 * [4] [8] [12] [16] [20] [24] [32] [48]
 */

import React from 'react';
import { GridDivision } from '../../editor/editor-types';

interface GridSelectorProps {
  selectedGrid: GridDivision;
  onSelectGrid: (grid: GridDivision) => void;
}

const PRESET_GRIDS: GridDivision[] = [4, 8, 12, 16, 20, 24, 32, 48];

export const GridSelector: React.FC<GridSelectorProps> = ({
  selectedGrid,
  onSelectGrid,
}) => {
  return (
    <div id="grid-selector-area" className="flex flex-col gap-1 select-none shrink-0">
      {/* Label */}
      <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium tracking-wide">
        グリッド（小節分割）
      </span>

      {/* Grid Preset Buttons: 4, 8, 12, 16, 20, 24, 32, 48 */}
      <div className="flex items-center gap-1">
        {PRESET_GRIDS.map((g) => {
          const isSelected = selectedGrid === g;

          return (
            <button
              key={g}
              id={`btn-grid-${g}`}
              onClick={() => onSelectGrid(g)}
              className={`min-w-[28px] sm:min-w-[32px] h-7 px-1.5 sm:px-2 text-xs font-mono rounded flex items-center justify-center transition-colors border shrink-0 touch-manipulation active:scale-95 ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-500 font-semibold shadow-sm'
                  : 'bg-slate-850 text-slate-300 border-slate-700/60 hover:bg-slate-800'
              }`}
            >
              {g}
            </button>
          );
        })}
      </div>
    </div>
  );
};
