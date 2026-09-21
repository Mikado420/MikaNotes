/**
 * MikaNotes Phase 2 / Phase 4-2 - Playhead (Playback Cursor)
 * Spans from top of waveform to bottom of Measure lane with downward arrow indicator.
 * Supports high-frequency RAF time subscription during audio playback for 60fps zero-re-render updates.
 */

import React, { useRef, useEffect } from 'react';
import { Timeline } from '../../core';
import { TimelineLayout } from '../../editor/editor-types';
import { AudioEngine } from '../../audio/AudioEngine';
import { timeToTimelineX } from '../../editor/coordinate-mapping';

interface PlayheadProps {
  x: number;
  timeline?: Timeline;
  layout?: TimelineLayout;
  audioEngine?: AudioEngine;
  chartOffset?: number;
  isPlaying?: boolean;
}

export const Playhead: React.FC<PlayheadProps> = ({
  x,
  timeline,
  layout,
  audioEngine,
  chartOffset = 0,
  isPlaying = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Direct position sync when paused, seeking, or when layout/zoom changes
  useEffect(() => {
    if (!isPlaying && containerRef.current) {
      containerRef.current.style.left = `${x}px`;
    }
  }, [x, isPlaying]);

  // High-frequency 60fps RAF subscriber during active audio playback (zero React re-renders)
  useEffect(() => {
    if (!isPlaying || !audioEngine || !timeline || !layout) return;

    const unsub = audioEngine.subscribeTime((audioTime) => {
      if (containerRef.current) {
        const t = audioTime + chartOffset;
        const currentX = timeToTimelineX(t, timeline, layout);
        containerRef.current.style.left = `${currentX}px`;
      }
    });

    return unsub;
  }, [isPlaying, audioEngine, timeline, layout, chartOffset]);

  return (
    <div
      ref={containerRef}
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

