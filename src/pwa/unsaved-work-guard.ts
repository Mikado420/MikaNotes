/**
 * MikaNotes PWA - Unsaved Work Guard
 * Protects user chart changes from unexpected service worker reload or navigation.
 */

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
