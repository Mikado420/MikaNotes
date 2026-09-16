/**
 * MikaNotes Phase 2 - Auxiliary Tool Panels
 * GogoToolPanel, BpmToolPanel, MeasureToolPanel for secondary editing tabs
 */

import React, { useState } from 'react';

interface GogoToolPanelProps {
  gogoMode?: 'GOGOSTART' | 'GOGOEND';
  onChangeGogoMode?: (mode: 'GOGOSTART' | 'GOGOEND') => void;
  onAddGogo?: () => void;
  onRemoveGogo?: () => void;
}

export const GogoToolPanel: React.FC<GogoToolPanelProps> = ({
  gogoMode = 'GOGOSTART',
  onChangeGogoMode,
  onAddGogo,
  onRemoveGogo,
}) => {
  return (
    <div className="flex items-center gap-2 h-14 shrink-0">
      <button
        onClick={() => {
          onChangeGogoMode?.('GOGOSTART');
          onAddGogo?.();
        }}
        className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 touch-manipulation active:scale-95 ${
          gogoMode === 'GOGOSTART'
            ? 'bg-amber-600 text-white font-semibold ring-1 ring-amber-400 shadow-sm'
            : 'bg-amber-950/40 border border-amber-500/60 text-amber-300 hover:bg-amber-900/40'
        }`}
      >
        <span>👑</span>
        <span>GOGO区間を開始 (#GOGOSTART)</span>
      </button>
      <button
        onClick={() => {
          onChangeGogoMode?.('GOGOEND');
          onRemoveGogo?.();
        }}
        className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 touch-manipulation active:scale-95 ${
          gogoMode === 'GOGOEND'
            ? 'bg-slate-600 text-white font-semibold ring-1 ring-slate-400 shadow-sm'
            : 'bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-700/80'
        }`}
      >
        <span>GOGO区間を終了 (#GOGOEND)</span>
      </button>
      <span className="text-[11px] text-slate-400 pl-2 shrink-0">
        ※タイムラインタップで選択位置に挿入
      </span>
    </div>
  );
};

interface BpmToolPanelProps {
  currentBpm?: number;
  onChangeBpm?: (bpm: number) => void;
  onSetBpm?: (bpm: number) => void;
}

export const BpmToolPanel: React.FC<BpmToolPanelProps> = ({
  currentBpm = 120,
  onChangeBpm,
  onSetBpm,
}) => {
  return (
    <div className="flex items-center gap-2 h-14 shrink-0">
      <span className="text-xs text-slate-400 shrink-0">設定BPM:</span>
      <input
        type="number"
        value={currentBpm}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) {
            onChangeBpm?.(v);
          }
        }}
        className="w-16 sm:w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-white text-center focus:border-sky-500 focus:outline-none shrink-0"
      />
      <button
        onClick={() => {
          if (currentBpm > 0 && isFinite(currentBpm)) onSetBpm?.(currentBpm);
        }}
        className="px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg shadow-sm shrink-0 touch-manipulation active:scale-95"
      >
        再生ヘッド位置に挿入
      </button>
      <div className="flex items-center gap-1 pl-1 shrink-0">
        {[120, 140, 160, 180, 200].map((b) => (
          <button
            key={b}
            onClick={() => {
              onChangeBpm?.(b);
              onSetBpm?.(b);
            }}
            className={`px-2 py-1 text-xs font-mono rounded transition-colors shrink-0 touch-manipulation active:scale-95 ${
              currentBpm === b
                ? 'bg-sky-600 text-white font-semibold'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
            }`}
          >
            {b}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-slate-400 pl-2 shrink-0">
        ※タイムラインタップで指定位置に挿入
      </span>
    </div>
  );
};

interface MeasureToolPanelProps {
  currentSig?: string;
  onChangeSig?: (sig: string) => void;
  onSetTimeSignature?: (num: number, den: number) => void;
}

export const MeasureToolPanel: React.FC<MeasureToolPanelProps> = ({
  currentSig = '4/4',
  onChangeSig,
  onSetTimeSignature,
}) => {
  return (
    <div className="flex items-center gap-2 h-14 shrink-0">
      <span className="text-xs text-slate-400 shrink-0">小節拍子:</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {['4/4', '3/4', '5/4', '7/8', '2/4', '6/8'].map((sig) => {
          const [n, d] = sig.split('/').map(Number);
          const isSelected = currentSig === sig;

          return (
            <button
              key={sig}
              onClick={() => {
                onChangeSig?.(sig);
                onSetTimeSignature?.(n, d);
              }}
              className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-colors shrink-0 touch-manipulation active:scale-95 ${
                isSelected
                  ? 'bg-emerald-600 text-white border-emerald-500 font-semibold shadow-sm'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
              }`}
            >
              {sig}
            </button>
          );
        })}
      </div>
      <span className="text-[11px] text-slate-400 pl-2 shrink-0">
        ※タイムラインタップで小節に適用
      </span>
    </div>
  );
};
