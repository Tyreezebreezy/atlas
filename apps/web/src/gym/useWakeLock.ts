import { useEffect, useRef } from 'react';

/**
 * Best-effort: keeps the screen on while `active`. Silently no-ops where the
 * Wake Lock API is unsupported, denied, or the page isn't visible yet --
 * there's no meaningful fallback UI for that, the workout just proceeds
 * without it.
 *
 * v0.2.0: the caller passes the whole active-session condition, not just
 * "a timer is running" -- a workout is still "in progress" between sets
 * while the owner is typing weight/reps with no timer active, and the
 * screen must not lock then either.
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        lockRef.current = lock;
      } catch {
        // permission denied / unsupported / page hidden -- degrade silently
      }
    }

    void acquire();

    // The OS releases the lock when the tab/window is hidden and never
    // re-acquires it automatically -- do that ourselves on return.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && !lockRef.current) {
        void acquire();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
