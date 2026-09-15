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
        className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition-colors active:scale-95"
        title="ズームイン (+)"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <span
        onClick={onResetZoom}
        className="text-[11px] font-mono font-medium py-1 px-1 text-slate-200 cursor-pointer hover:text-blue-400 select-none"
        title="ズームをリセット (100%)"
      >
        {Math.round(zoom)}%
      </span>

      <button
        id="btn-zoom-out"
        onClick={onZoomOut}
        className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition-colors active:scale-95"
        title="ズームアウト (-)"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
    </div>
  );
};
