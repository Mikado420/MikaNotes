/**
 * MikaNotes Phase 2 - Editor Toolbar
 * Hosts the mode switching tabs:
 * [🎵 音符] [👑 GOGO] [✦ (±) BPM変更 ✦] [✦ 💾 拍子変更 ✦]
 * and the active tool panels + grid configuration area.
 */

import React from 'react';
import { Music, Crown, Gauge, SplitSquareVertical } from 'lucide-react';
import { EditorTab, NoteToolType, GridDivision } from '../../editor/editor-types';
import { PendingSpecialNote } from '../../editor/special-notes';
import { NoteToolPanel } from '../tools/NoteToolPanel';
import { GridSelector } from '../tools/GridSelector';
import {
  GogoToolPanel,
  BpmToolPanel,
  MeasureToolPanel,
} from '../tools/AuxiliaryToolPanels';

interface EditorToolbarProps {
  selectedTab: EditorTab;
  onSelectTab: (tab: EditorTab) => void;
  selectedTool: NoteToolType;
  onSelectTool: (tool: NoteToolType) => void;
  selectedGrid: GridDivision;
  onSelectGrid: (grid: GridDivision) => void;
  pendingSpecialNote?: PendingSpecialNote | null;
  onCancelPending?: () => void;
  balloonHitCount?: number;
  onChangeBalloonHitCount?: (count: number) => void;
  gogoMode?: 'GOGOSTART' | 'GOGOEND';
  onChangeGogoMode?: (mode: 'GOGOSTART' | 'GOGOEND') => void;
  onAddGogo?: () => void;
  onRemoveGogo?: () => void;
  bpmInput?: number;
  onChangeBpm?: (bpm: number) => void;
  onSetBpm?: (bpm: number) => void;
  measureInput?: string;
  onChangeMeasure?: (sig: string) => void;
  onSetMeasure?: (num: number, den: number) => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  selectedTab,
  onSelectTab,
  selectedTool,
  onSelectTool,
  selectedGrid,
  onSelectGrid,
  pendingSpecialNote,
  onCancelPending,
  balloonHitCount,
  onChangeBalloonHitCount,
  gogoMode,
  onChangeGogoMode,
  onAddGogo,
  onRemoveGogo,
  bpmInput,
  onChangeBpm,
  onSetBpm,
  measureInput,
  onChangeMeasure,
  onSetMeasure,
}) => {
  return (
    <div
      id="editor-toolbar"
      className="bg-[#090e18] border-t border-slate-850 select-none shrink-0 z-30 flex flex-col"
    >
      {/* Top Tab Bar matching reference image */}
      <div className="h-8 border-b border-slate-800/80 px-3 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {/* Tab 1: 音符 */}
        <button
          id="tab-note"
          onClick={() => onSelectTab('note')}
          className={`h-7 px-3.5 rounded-t text-xs font-medium flex items-center gap-1.5 transition-colors ${
            selectedTab === 'note'
              ? 'bg-blue-600 text-white font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>音符</span>
        </button>

        {/* Tab 2: GOGO */}
        <button
          id="tab-gogo"
          onClick={() => onSelectTab('gogo')}
          className={`h-7 px-3.5 rounded-t text-xs font-medium flex items-center gap-1.5 transition-colors ${
            selectedTab === 'gogo'
              ? 'bg-blue-600 text-white font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Crown className="w-3.5 h-3.5 text-amber-400" />
          <span>GOGO</span>
        </button>

        {/* Tab 3: BPM変更 */}
        <button
          id="tab-bpm"
          onClick={() => onSelectTab('bpm')}
          className={`h-7 px-3.5 rounded-t text-xs font-medium flex items-center gap-1.5 transition-colors ${
            selectedTab === 'bpm'
              ? 'bg-blue-600 text-white font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <span className="text-[10px] text-slate-500">✦</span>
          <Gauge className="w-3.5 h-3.5 text-sky-400" />
          <span>BPM変更</span>
          <span className="text-[10px] text-slate-500">✦</span>
        </button>

        {/* Tab 4: 拍子変更 */}
        <button
          id="tab-measure"
          onClick={() => onSelectTab('measure')}
          className={`h-7 px-3.5 rounded-t text-xs font-medium flex items-center gap-1.5 transition-colors ${
            selectedTab === 'measure'
              ? 'bg-blue-600 text-white font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <span className="text-[10px] text-slate-500">✦</span>
          <SplitSquareVertical className="w-3.5 h-3.5 text-emerald-400" />
          <span>拍子変更</span>
          <span className="text-[10px] text-slate-500">✦</span>
        </button>
      </div>

      {/* Lower Panel: Active Tool Panel on Left + Grid Selector on Right */}
      <div className="h-16 px-3 py-1 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none">
        {/* Left: Tools according to selected tab */}
        <div className="flex items-center min-w-0">
          {selectedTab === 'note' && (
            <NoteToolPanel
              selectedTool={selectedTool}
              onSelectTool={onSelectTool}
              pendingSpecialNote={pendingSpecialNote}
              onCancelPending={onCancelPending}
              balloonHitCount={balloonHitCount}
              onChangeBalloonHitCount={onChangeBalloonHitCount}
            />
          )}

          {selectedTab === 'gogo' && (
            <GogoToolPanel
              gogoMode={gogoMode}
              onChangeGogoMode={onChangeGogoMode}
              onAddGogo={onAddGogo}
              onRemoveGogo={onRemoveGogo}
            />
          )}

          {selectedTab === 'bpm' && (
            <BpmToolPanel
              currentBpm={bpmInput}
              onChangeBpm={onChangeBpm}
              onSetBpm={onSetBpm}
            />
          )}

          {selectedTab === 'measure' && (
            <MeasureToolPanel
              currentSig={measureInput}
              onChangeSig={onChangeMeasure}
              onSetTimeSignature={onSetMeasure}
            />
          )}
        </div>

        {/* Right: Grid Selector Area */}
        <div className="shrink-0 pl-2 border-l border-slate-800/80">
          <GridSelector
            selectedGrid={selectedGrid}
            onSelectGrid={onSelectGrid}
          />
        </div>
      </div>
    </div>
  );
};
