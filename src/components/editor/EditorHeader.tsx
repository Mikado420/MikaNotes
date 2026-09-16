/**
 * MikaNotes Phase 2 - Editor Header
 * Matches exact UI layout from reference image:
 * Left: Logo, file name, edit pencil
 * Center: Play/pause button, current/total time display (02:42.172 / 03:45.600)
 * Right: Undo, Redo, divider, Settings, Menu
 */

import React, { useState } from 'react';
import {
  Play,
  Pause,
  Undo2,
  Redo2,
  Settings,
  Menu,
  FileText,
  Pencil,
  Check,
  FileCode,
  Layers,
} from 'lucide-react';

const COURSE_LABELS: Record<number, string> = {
  0: 'かんたん (Easy)',
  1: 'ふつう (Normal)',
  2: 'むずかしい (Hard)',
  3: 'おに (Oni)',
  4: '裏/Edit',
};

interface EditorHeaderProps {
  fileName: string;
  onRenameFile: (name: string) => void;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  currentTime: number;
  totalDuration: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSettings: () => void;
  onOpenMenu: () => void;
  activeCourseKey?: number;
  availableCourseKeys?: number[];
  onSelectCourseKey?: (key: number) => void;
  onOpenTextEditor?: () => void;
}

/**
 * Format seconds to mm:ss.mmm
 * e.g. 162.172 -> "02:42.172"
 */
function formatTime(seconds: number): string {
  const safeSec = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const m = Math.floor(safeSec / 60);
  const s = Math.floor(safeSec % 60);
  const ms = Math.floor((safeSec % 1) * 1000);

  const mmStr = m.toString().padStart(2, '0');
  const ssStr = s.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(3, '0');

  return `${mmStr}:${ssStr}.${msStr}`;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  fileName,
  onRenameFile,
  isPlaying,
  onTogglePlayback,
  currentTime,
  totalDuration,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenSettings,
  onOpenMenu,
  activeCourseKey = 3,
  availableCourseKeys = [3],
  onSelectCourseKey,
  onOpenTextEditor,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(fileName);

  const handleFinishRename = () => {
    if (nameInput.trim()) {
      onRenameFile(nameInput.trim());
    }
    setIsEditingName(false);
  };

  return (
    <header
      id="mikanotes-header"
      className="h-11 bg-[#090e18] border-b border-slate-800/80 safe-pl safe-pr safe-pt px-3 flex items-center justify-between select-none z-30 shrink-0 text-slate-200"
    >
      {/* Left: Brand & File name & Course selector */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-bold text-sm sm:text-base tracking-tight text-white font-sans">
            MikaNotes
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs text-slate-400 pl-1 shrink-0">
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />

          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={(e) => e.key === 'Enter' && handleFinishRename()}
                autoFocus
                className="bg-slate-800 text-white text-xs px-1.5 py-0.5 rounded border border-blue-500 focus:outline-none w-24 sm:w-28 font-mono"
              />
              <button
                onClick={handleFinishRename}
                className="text-emerald-400 hover:text-emerald-300 p-1 touch-manipulation"
                title="Save name"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div
              className="flex items-center gap-1 cursor-pointer group"
              onClick={() => {
                setNameInput(fileName);
                setIsEditingName(true);
              }}
              title="Click to rename"
            >
              <span className="font-mono text-slate-300 text-xs truncate max-w-[80px] sm:max-w-[160px]">
                {fileName}
              </span>
              <Pencil className="w-3 h-3 text-slate-500 group-hover:text-slate-300 opacity-80 shrink-0" />
            </div>
          )}
        </div>

        {/* Course Selector Dropdown */}
        {availableCourseKeys.length > 0 && onSelectCourseKey && (
          <div className="flex items-center ml-0.5 sm:ml-2 shrink-0">
            <div className="relative flex items-center">
              <select
                id="select-course-key"
                value={activeCourseKey}
                onChange={(e) => onSelectCourseKey(Number(e.target.value))}
                className="bg-slate-900 hover:bg-slate-800 text-amber-300 font-medium text-[11px] h-7 px-1.5 sm:px-2 rounded border border-slate-700/80 focus:outline-none focus:border-amber-500 cursor-pointer transition-colors touch-manipulation"
                title="コース選択 (CourseKey)"
              >
                {availableCourseKeys.map((cKey) => (
                  <option key={cKey} value={cKey} className="bg-slate-900 text-white">
                    {COURSE_LABELS[cKey] ?? `Course ${cKey}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Center: Play / Pause & Time readout */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        <button
          id="btn-play-pause"
          onClick={onTogglePlayback}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800/80 hover:bg-slate-750 text-white transition-colors active:scale-95 touch-manipulation shrink-0 shadow-sm"
          title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-white text-white" />
          ) : (
            <Play className="w-4 h-4 fill-white text-white ml-0.5" />
          )}
        </button>

        <div
          id="time-display"
          className="font-mono text-[11px] sm:text-xs md:text-sm text-slate-300 tracking-wider flex items-center whitespace-nowrap"
        >
          <span className="text-white font-medium">{formatTime(currentTime)}</span>
          <span className="mx-0.5 sm:mx-1 text-slate-600">/</span>
          <span className="text-slate-400">{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Right: TJA Text Editor button, Undo, Redo, Settings, Menu */}
      <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
        {onOpenTextEditor && (
          <button
            id="btn-open-tja-editor"
            onClick={onOpenTextEditor}
            className="flex items-center gap-1 h-7 px-1.5 sm:px-2.5 rounded bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 hover:text-blue-200 border border-blue-600/40 text-xs font-medium transition-all shadow-sm active:scale-95 touch-manipulation mr-0.5 sm:mr-1"
            title="TJAテキストエディタを開く (直接編集・検証・適用)"
          >
            <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="hidden sm:inline">TJAテキスト</span>
          </button>
        )}

        <button
          id="btn-undo"
          onClick={onUndo}
          disabled={!canUndo}
          className={`w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300 transition-colors touch-manipulation ${
            !canUndo ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
          }`}
          title="元に戻す (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          id="btn-redo"
          onClick={onRedo}
          disabled={!canRedo}
          className={`w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300 transition-colors touch-manipulation ${
            !canRedo ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
          }`}
          title="やり直し (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-slate-800 mx-0.5 sm:mx-1" />

        <button
          id="btn-settings"
          onClick={onOpenSettings}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300 transition-colors active:scale-95 touch-manipulation"
          title="設定"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          id="btn-menu"
          onClick={onOpenMenu}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300 transition-colors active:scale-95 touch-manipulation"
          title="メニュー (TJA読込/保存・Workbench)"
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
