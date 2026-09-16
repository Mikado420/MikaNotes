/**
 * MikaNotes Phase 2 - Note Tool Panel
 * Provides tool buttons for Don, Ka, Big Don, Big Ka, Roll, Big Roll, Balloon, and Erase
 * exactly matching the reference design layout and styling.
 */

import React from 'react';
import { Eraser, X } from 'lucide-react';
import { NoteToolType } from '../../editor/editor-types';
import { PendingSpecialNote } from '../../editor/special-notes';

interface NoteToolPanelProps {
  selectedTool: NoteToolType;
  onSelectTool: (tool: NoteToolType) => void;
  pendingSpecialNote?: PendingSpecialNote | null;
  onCancelPending?: () => void;
  balloonHitCount?: number;
  onChangeBalloonHitCount?: (count: number) => void;
}

export const NoteToolPanel: React.FC<NoteToolPanelProps> = ({
  selectedTool,
  onSelectTool,
  pendingSpecialNote,
  onCancelPending,
  balloonHitCount = 5,
  onChangeBalloonHitCount,
}) => {
  return (
    <div id="note-tool-panel" className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
      {/* 1. ドン (Don) */}
      <button
        id="tool-don"
        onClick={() => onSelectTool('1')}
        className={`w-12 h-14 rounded-lg flex flex-col items-center justify-between p-1.5 transition-all border ${
          selectedTool === '1'
            ? 'bg-slate-800/90 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
            : 'bg-slate-900/60 border-slate-700/60 hover:bg-slate-800/60'
        }`}
        title="ドン (1)"
      >
        <div className="w-6 h-6 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="#111827" />
            <circle cx="50" cy="50" r="44" fill="white" />
            <circle cx="50" cy="50" r="38" fill="#e63946" />
          </svg>
        </div>
        <span className="text-[11px] font-medium text-slate-200">ドン</span>
      </button>

      {/* 2. カッ (Ka) */}
      <button
        id="tool-ka"
        onClick={() => onSelectTool('2')}
        className={`w-12 h-14 rounded-lg flex flex-col items-center justify-between p-1.5 transition-all border ${
          selectedTool === '2'
            ? 'bg-slate-800/90 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
            : 'bg-slate-900/60 border-slate-700/60 hover:bg-slate-800/60'
        }`}
        title="カッ (2)"
      >
        <div className="w-6 h-6 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="#111827" />
            <circle cx="50" cy="50" r="44" fill="white" />
            <circle cx="50" cy="50" r="38" fill="#38bdf8" />
          </svg>
        </div>
        <span className="text-[11px] font-medium text-slate-200">カッ</span>
      </button>

      {/* 3. 大ドン (Big Don) */}
      <button
        id="tool-big-don"
        onClick={() => onSelectTool('3')}
        className={`w-12 h-14 rounded-lg flex flex-col items-center justify-between p-1.5 transition-all border ${
          selectedTool === '3'
            ? 'bg-slate-800/90 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
            : 'bg-slate-900/60 border-slate-700/60 hover:bg-slate-800/60'
        }`}
        title="大ドン (3)"
      >
        <div className="w-6 h-6 flex items-center justify-center">
          <svg width="26" height="26" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="#111827" />
            <circle cx="50" cy="50" r="44" fill="white" />
            <circle cx="50" cy="50" r="38" fill="#e63946" />
            <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="4" />
          </svg>
        </div>
        <span className="text-[10px] font-medium text-slate-200">大ドン</span>
      </button>

      {/* 4. 大カッ (Big Ka) */}
      <button
        id="tool-big-ka"
        onClick={() => onSelectTool('4')}
        className={`w-12 h-14 rounded-lg flex flex-col items-center justify-between p-1.5 transition-all border ${
          selectedTool === '4'
            ? 'bg-slate-800/90 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
            : 'bg-slate-900/60 border-slate-700/60 hover:bg-slate-800/60'
        }`}
        title="大カッ (4)"
      >
        <div className="w-6 h-6 flex items-center justify-center">
          <svg width="26" height="26" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="#111827" />
            <circle cx="50" cy="50" r="44" fill="white" />
            <circle cx="50" cy="50" r="38" fill="#38bdf8" />
            <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="4" />
          </svg>
        </div>
        <span className="text-[10px] font-medium text-slate-200">大カッ</span>
      </button>

      {/* 5. 連打 (Roll) */}
      <button
        id="tool-roll"
        onClick={() => onSelectTool('5')}
        className={`w-14 h-14 rounded-lg flex flex-col items-center justify-between p-1.5 transition-all border ${
          selectedTool === '5'
            ? 'bg-slate-800/90 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
            : 'bg-slate-900/60 border-slate-700/60 hover:bg-slate-800/60'
        }`}
        title="連打 (5)"
      >
        <div className="w-full h-6 flex items-center justify-center">
          <div className="w-9 h-3.5 rounded-full bg-yellow-400 border border-white" />
        </div>
        <span className="text-[11px] font-medium text-slate-200">連打</span>
      </button>

      {/* 6. 大連打 (Big Roll) */}
      <button
        id="tool-big-roll"
        onClick={() => onSelectTool('6')}
        className={`w-14 h-14 rounded-lg flex flex-col items-center justify-between p-1.5 transition-all border ${
          selectedTool === '6'
            ? 'bg-slate-800/90 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
            : 'bg-slate-900/60 border-slate-700/60 hover:bg-slate-800/60'
        }`}
        title="大連打 (6)"
      >
        <div className="w-full h-6 flex items-center justify-center">
          <div className="w-9 h-4.5 rounded-full bg-amber-500 border border-white" />
        </div>
        <span className="text-[10px] font-medium text-slate-200">大連打</span>
      </button>

      {/* 7. 風船 (Balloon) */}
      <button
        id="tool-balloon"
        onClick={() => onSelectTool('7')}
        className={`w-12 h-14 rounded-lg flex flex-col items-center justify-between p-1.5 transition-all border ${
          selectedTool === '7'
            ? 'bg-slate-800/90 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
            : 'bg-slate-900/60 border-slate-700/60 hover:bg-slate-800/60'
        }`}
        title="風船 (7)"
      >
        <div className="w-6 h-6 flex items-center justify-center">
          <div className="w-4 h-4.5 rounded-t-full rounded-b-lg bg-pink-500 border border-white" />
        </div>
        <span className="text-[11px] font-medium text-slate-200">風船</span>
      </button>

      {/* 8. 消去 (Erase) */}
      <button
        id="tool-erase"
        onClick={() => onSelectTool('erase')}
        className={`w-12 h-14 rounded-lg flex flex-col items-center justify-between p-1.5 transition-all border ${
          selectedTool === 'erase'
            ? 'bg-slate-800/90 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
            : 'bg-slate-900/60 border-slate-700/60 hover:bg-slate-800/60'
        }`}
        title="ノーツ消去"
      >
        <div className="w-6 h-6 flex items-center justify-center text-slate-300">
          <Eraser className="w-5 h-5" />
        </div>
        <span className="text-[11px] font-medium text-slate-200">消去</span>
      </button>

      {/* Balloon hit count configuration when Balloon tool is active */}
      {selectedTool === '7' && (
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-pink-950/40 border border-pink-700/50 text-pink-200 text-xs">
          <span className="text-[11px] font-medium">打数:</span>
          <input
            id="balloon-hit-count-input"
            type="number"
            min="1"
            max="999"
            value={balloonHitCount}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val > 0 && onChangeBalloonHitCount) {
                onChangeBalloonHitCount(val);
              }
            }}
            className="w-12 px-1.5 py-0.5 rounded bg-slate-900 border border-pink-500/60 text-center text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </div>
      )}

      {/* Pending State Indicator & Cancel Button */}
      {pendingSpecialNote && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/60 border border-amber-500/80 text-amber-200 text-xs animate-pulse">
          <span className="font-semibold">
            {pendingSpecialNote.type === 'balloon'
              ? '風船'
              : pendingSpecialNote.type === 'big_roll'
              ? '大連打'
              : '連打'}
            開始点設定済 (M{pendingSpecialNote.startMeasureIndex + 1})
          </span>
          {onCancelPending && (
            <button
              onClick={onCancelPending}
              className="p-0.5 ml-1 rounded hover:bg-amber-800/60 text-amber-300 hover:text-white"
              title="配置キャンセル"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
