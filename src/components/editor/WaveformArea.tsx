/**
 * MikaNotes Phase 2 - Waveform Area
 * Displays audio waveform placeholder with precision coral-red spikes
 * aligned with the timeline layout and beat grid.
 */

import React, { useMemo } from 'react';
import { TimelineLayout } from '../../editor/editor-types';

interface WaveformAreaProps {
  layout: TimelineLayout;
}

export const WaveformArea: React.FC<WaveformAreaProps> = ({ layout }) => {
  // Generate deterministic aesthetic waveform spikes matching the reference image's coral red peaks
  const waveformSvg = useMemo(() => {
    const width = layout.totalWidth;
    const height = 36;
    const centerY = height / 2;
    const step = 2.5; // pixel interval between spikes
    const count = Math.ceil(width / step);

    const paths: string[] = [];

    // Seeded pseudo-random waveform generator for consistent look across frames
    let mIdx = 0;
    const measures = layout.measures;
    const numMeasures = measures.length;

    for (let i = 0; i < count; i++) {
      const x = i * step;

      // Advance measure pointer monotonically with x
      while (mIdx < numMeasures - 1 && x > measures[mIdx].endX) {
        mIdx++;
      }

      // Find if we are near a measure boundary or beat
      let ampBase = 0.35;
      const m = measures[mIdx];
      if (m && x >= m.startX && x <= m.endX) {
        const relX = x - m.startX;
        const beatDist = relX % layout.baseBeatWidth;
        if (beatDist < 4 || beatDist > layout.baseBeatWidth - 4) {
          ampBase = 0.75; // Peak on beats
        }
      }

      // Pseudo-random modulation with musical harmonics
      const n1 = Math.sin(i * 0.15);
      const n2 = Math.cos(i * 0.43);
      const n3 = Math.sin(i * 0.89);
      const rawAmp = (Math.abs(n1) * 0.4 + Math.abs(n2) * 0.35 + Math.abs(n3) * 0.25) * ampBase;
      const h = Math.max(2, rawAmp * (height - 4));

      paths.push(`M ${x.toFixed(1)} ${(centerY - h / 2).toFixed(1)} L ${x.toFixed(1)} ${(centerY + h / 2).toFixed(1)}`);
    }

    return paths.join(' ');
  }, [layout]);

  return (
    <div
      id="waveform-area"
      className="relative h-9 bg-[#0b101c] border-b border-slate-800/80 overflow-hidden select-none"
      style={{ width: `${layout.totalWidth}px` }}
    >
      {/* Center zero-crossing line */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-red-900/30" />

      {/* Waveform peaks in coral red (#ef4444 to #f43f5e) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ width: `${layout.totalWidth}px`, height: '36px' }}
      >
        <path
          d={waveformSvg}
          stroke="#e05252"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    </div>
  );
};
