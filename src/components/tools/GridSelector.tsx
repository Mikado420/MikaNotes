/**
 * MikaNotes Phase 2 - Grid Selector
 * Allows switching between standard grid divisions:
 * [4] [8] [12] [16] [20] [24] [32] [48] [自由]
 * Includes slider and exact division badge.
 */

import React from 'react';
import { GridDivision } from '../../editor/editor-types';

interface GridSelectorProps {
  selectedGrid: GridDivision;
  customGridDiv: number;
  onSelectGrid: (grid: GridDivision) => void;
  onChangeCustomGrid: (val: number) => void;
}

const PRESET_GRIDS: GridDivision[] = [4, 8, 12, 16, 20, 24, 32, 48, 'free'];

export const GridSelector: React.FC<GridSelectorProps> = ({
  selectedGrid,
  customGridDiv,
  onSelectGrid,
  onChangeCustomGrid,
}) => {
  const currentNumericValue = typeof selectedGrid === 'number' ? selectedGrid : customGridDiv;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) {
      onChangeCustomGrid(val);
      if (selectedGrid !== 'free') {
        // Find if val matches preset
        if (PRESET_GRIDS.includes(val as any)) {
          onSelectGrid(val as GridDivision);
        } else {
          onSelectGrid('free');
        }
      }
    }
  };

  return (
    <div id="grid-selector-area" className="flex flex-col gap-1 select-none">
      {/* Label */}
      <span className="text-[11px] text-slate-400 font-medium tracking-wide">
        グリッド（1小節の分割数）
      </span>

      {/* Grid Preset Buttons */}
      <div className="flex items-center gap-1">
        {PRESET_GRIDS.map((g) => {
          const isSelected = selectedGrid === g;
          const label = g === 'free' ? '自由' : g.toString();

          return (
            <button
              key={g}
              id={`btn-grid-${g}`}
              onClick={() => {
                onSelectGrid(g);
                if (typeof g === 'number') {
                  onChangeCustomGrid(g);
                }
              }}
              className={`min-w-[28px] h-6 px-1.5 text-xs font-mono rounded flex items-center justify-center transition-colors border ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-500 font-semibold shadow-sm'
                  : 'bg-slate-850 text-slate-300 border-slate-700/60 hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Slider & Division Badge */}
      <div className="flex items-center gap-2 mt-0.5">
        <input
          type="range"
          min="1"
          max="64"
          step="1"
          value={currentNumericValue}
          onChange={handleSliderChange}
          className="w-28 sm:w-36 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />

        <div className="flex items-center gap-1">
          <div className="bg-slate-800/90 border border-slate-700 rounded px-2 py-0.5 text-xs font-mono text-white min-w-[28px] text-center font-semibold">
            {currentNumericValue}
          </div>
          <span className="text-[11px] text-slate-400">分割</span>
        </div>
      </div>
    </div>
  );
};
