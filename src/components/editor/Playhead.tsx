/**
 * MikaNotes Phase 2 - Playhead (Playback Cursor)
 * Spans from top of waveform to bottom of Measure lane with downward arrow indicator
 */

import React from 'react';

interface PlayheadProps {
  x: number;
}

export const Playhead: React.FC<PlayheadProps> = ({ x }) => {
  return (
    <div
      id="playhead-cursor"
      className="absolute top-0 bottom-0 pointer-events-none z-20 flex flex-col items-center"
      style={{
        left: `${x}px`,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Downward pointing white triangle cursor at top */}
      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] -mb-[2px] z-30" />

      {/* Vertical sharp cursor line spanning all lanes */}
      <div className="w-[2px] flex-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] opacity-95" />
    </div>
  );
};
