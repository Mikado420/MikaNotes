/**
 * MikaNotes Phase 2 - Auxiliary Tool Panels
 * GogoToolPanel, BpmToolPanel, MeasureToolPanel for secondary editing tabs
 */

import React, { useState } from 'react';

interface GogoToolPanelProps {
  onAddGogo?: () => void;
  onRemoveGogo?: () => void;
}

export const GogoToolPanel: React.FC<GogoToolPanelProps> = ({
  onAddGogo,
  onRemoveGogo,
}) => {
  return (
    <div className="flex items-center gap-2 h-14">
      <button
        onClick={onAddGogo}
        className="px-3 py-2 bg-amber-950/40 border border-amber-500/60 rounded-lg text-amber-300 text-xs font-medium hover:bg-amber-900/40 flex items-center gap-1.5"
      >
        <span>👑</span>
        <span>GOGO区間を開始 (#GOGOSTART)</span>
      </button>
      <button
        onClick={onRemoveGogo}
        className="px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-slate-300 text-xs font-medium hover:bg-slate-700/80 flex items-center gap-1.5"
      >
        <span>GOGO区間を終了 (#GOGOEND)</span>
      </button>
    </div>
  );
};

interface BpmToolPanelProps {
  currentBpm?: number;
  onSetBpm?: (bpm: number) => void;
}

export const BpmToolPanel: React.FC<BpmToolPanelProps> = ({
  currentBpm = 120,
  onSetBpm,
}) => {
  const [bpmVal, setBpmVal] = useState(currentBpm.toString());

  return (
    <div className="flex items-center gap-2 h-14">
      <span className="text-xs text-slate-400">テンポ設定:</span>
      <input
        type="number"
        value={bpmVal}
        onChange={(e) => setBpmVal(e.target.value)}
        className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-white text-center"
      />
      <button
        onClick={() => {
          const v = parseFloat(bpmVal);
          if (!isNaN(v) && v > 0) onSetBpm?.(v);
        }}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg"
      >
        BPM変更を挿入
      </button>
      <div className="flex items-center gap-1 pl-2">
        {[120, 140, 160, 180, 200].map((b) => (
          <button
            key={b}
            onClick={() => {
              setBpmVal(b.toString());
              onSetBpm?.(b);
            }}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-mono rounded"
          >
            {b}
          </button>
        ))}
      </div>
    </div>
  );
};

interface MeasureToolPanelProps {
  currentSig?: string;
  onSetTimeSignature?: (num: number, den: number) => void;
}

export const MeasureToolPanel: React.FC<MeasureToolPanelProps> = ({
  currentSig = '4/4',
  onSetTimeSignature,
}) => {
  return (
    <div className="flex items-center gap-2 h-14">
      <span className="text-xs text-slate-400">小節拍子:</span>
      <div className="flex items-center gap-1.5">
        {['4/4', '3/4', '5/4', '7/8', '2/4', '6/8'].map((sig) => {
          const [n, d] = sig.split('/').map(Number);
          const isSelected = currentSig === sig;

          return (
            <button
              key={sig}
              onClick={() => onSetTimeSignature?.(n, d)}
              className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-500 font-semibold'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
              }`}
            >
              {sig}
            </button>
          );
        })}
      </div>
    </div>
  );
};
