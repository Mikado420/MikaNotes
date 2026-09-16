/**
 * MikaNotes Phase 3-B - Orientation Notice Overlay
 * Prompts smartphone users to rotate their device to landscape for the optimal charting experience.
 * Includes a smooth rotation icon, guidance text, and a non-blocking dismiss option.
 */

import React, { useState, useEffect } from 'react';
import { Smartphone, RotateCw, X } from 'lucide-react';

export const OrientationNotice: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Check if viewport is in portrait mode on mobile/tablet screens
      const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 768;
      setIsPortrait(portrait);
      // Reset dismissal when user rotates to landscape then back to portrait
      if (!portrait) {
        setIsDismissed(false);
      }
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait || isDismissed) {
    return null;
  }

  return (
    <div
      id="orientation-notice-overlay"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md text-white p-6 select-none"
    >
      <div className="relative max-w-xs w-full bg-slate-900 border border-slate-700/80 rounded-2xl p-6 text-center shadow-2xl flex flex-col items-center">
        {/* Dismiss Button */}
        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          title="閉じる"
          aria-label="閉じる"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Animated Rotate Phone Graphic */}
        <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-ping opacity-25" />
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Smartphone className="w-8 h-8 text-white transform rotate-90" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 rounded-full p-1 shadow">
            <RotateCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
          </div>
        </div>

        {/* Heading & Instructions */}
        <h3 className="text-base font-bold text-slate-100 mb-1.5">
          端末を横向きにしてください
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed mb-5">
          MikaNotesはスマートフォンを横画面にして両手で快適に譜面制作を行えるように設計されています。
        </p>

        {/* Action Button */}
        <button
          onClick={() => setIsDismissed(true)}
          className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700/80 transition-colors"
        >
          このまま縦画面で続ける
        </button>
      </div>
    </div>
  );
};
