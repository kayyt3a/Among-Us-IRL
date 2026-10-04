import { useEffect } from 'react';

/**
 * Keeps the screen on while `active` is true, so a phone doesn't lock itself
 * mid-round and miss a meeting, a blackout or a kill check.
 *
 * Browsers drop the lock whenever the page is hidden, so it's re-requested
 * when the page becomes visible again. Some browsers also refuse the first
 * request without a user gesture, so any tap retries it too. Browsers without
 * the Wake Lock API simply do nothing.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let requesting = false;
    let cancelled = false;

    async function request() {
      if (cancelled || sentinel || requesting || document.visibilityState !== 'visible') return;
      requesting = true;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Denied (low battery, no gesture yet, policy). A later tap or
        // visibility change will try again.
      } finally {
        requesting = false;
      }
    }

    request();
    document.addEventListener('visibilitychange', request);
    window.addEventListener('pointerdown', request, { passive: true });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      window.removeEventListener('pointerdown', request);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
