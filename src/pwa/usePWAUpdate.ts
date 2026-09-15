import { useState, useEffect, useRef, useCallback } from 'react';
import { registerSW } from 'virtual:pwa-register';

// Registry for protecting user chart editing state (Phase 2 integration)
type UnsavedWorkChecker = () => boolean;
const unsavedWorkCheckers = new Set<UnsavedWorkChecker>();

/**
 * Allows any editor or component to register an unsaved-work check.
 * If unsaved work exists when the user triggers an update, MikaNotes will warn them
 * before applying the service worker reload.
 */
export function registerUnsavedWorkGuard(checker: UnsavedWorkChecker): () => void {
  unsavedWorkCheckers.add(checker);
  return () => {
    unsavedWorkCheckers.delete(checker);
  };
}

export function checkHasUnsavedWork(): boolean {
  for (const checker of unsavedWorkCheckers) {
    try {
      if (checker()) return true;
    } catch (e) {
      console.error('Error executing unsaved work guard:', e);
    }
  }
  return false;
}

export interface PWAUpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
  registration: ServiceWorkerRegistration | undefined;
  lastCheckedTime: Date | null;
  checkForUpdates: () => Promise<void>;
  applyUpdate: (force?: boolean) => Promise<boolean>;
  dismissNotification: () => void;
}

export function usePWAUpdate(): PWAUpdateState {
  const [needRefresh, setNeedRefresh] = useState<boolean>(false);
  const [offlineReady, setOfflineReady] = useState<boolean>(false);
  const [lastCheckedTime, setLastCheckedTime] = useState<Date | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const updateSWCallbackRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // Only register service worker in browser environments that support it
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          console.log('[MikaNotes SW] New content available. Waiting for user confirmation to activate.');
          setNeedRefresh(true);
        },
        onOfflineReady() {
          console.log('[MikaNotes SW] App shell is precached and ready for offline use.');
          setOfflineReady(true);
        },
        onRegistered(registration) {
          registrationRef.current = registration;
          setLastCheckedTime(new Date());

          if (registration) {
            console.log('[MikaNotes SW] Service Worker registered with scope:', registration.scope);

            // Check for updates periodically (every 60 minutes)
            const intervalId = setInterval(() => {
              console.log('[MikaNotes SW] Checking for updates (periodic check)...');
              registration.update().catch((err) => {
                console.warn('[MikaNotes SW] Periodic update check failed:', err);
              });
              setLastCheckedTime(new Date());
            }, 60 * 60 * 1000);

            // Check for updates when user returns to the app (window focus / visibilitychange)
            const handleVisibilityChange = () => {
              if (document.visibilityState === 'visible') {
                console.log('[MikaNotes SW] App resumed. Checking for updates...');
                registration.update().catch((err) => {
                  console.warn('[MikaNotes SW] Resume update check failed:', err);
                });
                setLastCheckedTime(new Date());
              }
            };

            document.addEventListener('visibilitychange', handleVisibilityChange);

            return () => {
              clearInterval(intervalId);
              document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
          }
        },
        onRegisterError(error) {
          console.error('[MikaNotes SW] Service Worker registration failed:', error);
        },
      });

      updateSWCallbackRef.current = updateSW;
    } catch (err) {
      console.warn('[MikaNotes SW] registerSW encountered an issue:', err);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (registrationRef.current) {
      try {
        console.log('[MikaNotes SW] Manual update check triggered...');
        await registrationRef.current.update();
        setLastCheckedTime(new Date());
      } catch (err) {
        console.warn('[MikaNotes SW] Manual update check error:', err);
      }
    }
  }, []);

  const applyUpdate = useCallback(
    async (force: boolean = false): Promise<boolean> => {
      // 1. Guard against data loss if user is actively editing
      if (!force && checkHasUnsavedWork()) {
        const proceed = window.confirm(
          '編集中のデータがある可能性があります。保存せずに更新して再読み込みしますか？'
        );
        if (!proceed) {
          return false;
        }
      }

      // 2. Dispatch custom event allowing editors to flush auto-save state to localStorage/IndexedDB
      try {
        window.dispatchEvent(new CustomEvent('mikanotes:before-sw-update'));
      } catch (e) {
        console.error('Failed to dispatch before-sw-update event', e);
      }

      // 3. Activate the new service worker (skipWaiting) and reload
      if (updateSWCallbackRef.current) {
        await updateSWCallbackRef.current(true);
        return true;
      } else {
        window.location.reload();
        return true;
      }
    },
    []
  );

  const dismissNotification = useCallback(() => {
    setNeedRefresh(false);
  }, []);

  return {
    needRefresh,
    offlineReady,
    registration: registrationRef.current,
    lastCheckedTime,
    checkForUpdates,
    applyUpdate,
    dismissNotification,
  };
}
