/**
 * MikaNotes Phase 2 - Zoom Control
 * Floating vertical zoom widget on the left side of the timeline editor
 * [Zoom In (+)]
 * [ 155% ]
 * [Zoom Out (-)]
 */

import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface ZoomControlProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom?: () => void;
}

export const ZoomControl: React.FC<ZoomControlProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  return (
    <div
      id="zoom-control-widget"
      className="absolute left-2 top-2 z-30 flex flex-col items-center bg-slate-900/85 backdrop-blur-sm border border-slate-700/80 rounded-lg p-1 shadow-lg text-slate-300 select-none"
    >
      <button
        id="btn-zoom-in"
        onClick={onZoomIn}
        className="w-8 h-8 flex items-center justify-center hover:bg-slate-800 active:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors active:scale-90 touch-manipulation"
        title="ズームイン (+)"
        aria-label="ズームイン"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <span
        onClick={onResetZoom}
        className="text-[10px] font-mono font-bold py-1 px-1 text-slate-200 cursor-pointer hover:text-blue-400 active:scale-95 select-none touch-manipulation"
        title="ズームをリセット (100%)"
      >
        {Math.round(zoom)}%
      </span>

      <button
        id="btn-zoom-out"
        onClick={onZoomOut}
        className="w-8 h-8 flex items-center justify-center hover:bg-slate-800 active:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors active:scale-90 touch-manipulation"
        title="ズームアウト (-)"
        aria-label="ズームアウト"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
    </div>
  );
};
