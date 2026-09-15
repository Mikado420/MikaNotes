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
} from 'lucide-react';

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
      className="h-11 bg-[#090e18] border-b border-slate-800/80 px-3 flex items-center justify-between select-none z-30 shrink-0 text-slate-200"
    >
      {/* Left: Brand & File name */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-base tracking-tight text-white font-sans">
            MikaNotes
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 pl-1">
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
                className="bg-slate-800 text-white text-xs px-1.5 py-0.5 rounded border border-blue-500 focus:outline-none w-28 font-mono"
              />
              <button
                onClick={handleFinishRename}
                className="text-emerald-400 hover:text-emerald-300 p-0.5"
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
              <span className="font-mono text-slate-300 text-xs truncate max-w-[120px] sm:max-w-[180px]">
                {fileName}
              </span>
              <Pencil className="w-3 h-3 text-slate-500 group-hover:text-slate-300 opacity-80" />
            </div>
          )}
        </div>
      </div>

      {/* Center: Play / Pause & Time readout */}
      <div className="flex items-center gap-3">
        <button
          id="btn-play-pause"
          onClick={onTogglePlayback}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-800 text-white transition-colors active:scale-95"
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
          className="font-mono text-xs sm:text-sm text-slate-300 tracking-wider flex items-center"
        >
          <span className="text-white font-medium">{formatTime(currentTime)}</span>
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-slate-400">{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Right: Undo, Redo, Settings, Menu */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          id="btn-undo"
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
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
          className={`p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
            !canRedo ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
          }`}
          title="やり直し (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-slate-800 mx-1" />

        <button
          id="btn-settings"
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors active:scale-95"
          title="設定"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          id="btn-menu"
          onClick={onOpenMenu}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors active:scale-95"
          title="メニュー (TJA読込/保存・Workbench)"
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
