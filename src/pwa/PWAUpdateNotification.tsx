import React, { useState } from 'react';
import { RefreshCw, X, Sparkles, AlertCircle } from 'lucide-react';
import { PWAUpdateState } from './usePWAUpdate';

interface PWAUpdateNotificationProps {
  pwaState: PWAUpdateState;
}

export const PWAUpdateNotification: React.FC<PWAUpdateNotificationProps> = ({ pwaState }) => {
  const { needRefresh, applyUpdate, dismissNotification } = pwaState;
  const [isUpdating, setIsUpdating] = useState(false);

  if (!needRefresh) {
    return null;
  }

  const handleUpdate = async () => {
    setIsUpdating(true);
    const success = await applyUpdate();
    if (!success) {
      setIsUpdating(false);
    }
  };

  return (
    <aside
      aria-label="PWA Update Available"
      className="fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100vw-2rem)] bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-4 shadow-2xl shadow-black/80 backdrop-blur text-white animate-in fade-in slide-in-from-bottom-3 duration-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shrink-0 shadow-md shadow-rose-950/40 mt-0.5">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              MikaNotesを更新しました
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              最新版を利用できます。再読み込みして最新の機能を反映します。
            </p>
          </div>
        </div>

        <button
          onClick={dismissNotification}
          aria-label="閉じる"
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
        <button
          type="button"
          onClick={dismissNotification}
          disabled={isUpdating}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          後で
        </button>
        <button
          type="button"
          onClick={handleUpdate}
          disabled={isUpdating}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500 to-rose-600 text-white hover:from-amber-400 hover:to-rose-500 shadow-md shadow-amber-950/40 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
          <span>{isUpdating ? '更新中...' : '再読み込み'}</span>
        </button>
      </div>
    </aside>
  );
};
