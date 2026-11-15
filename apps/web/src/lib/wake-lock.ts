import { useEffect } from 'react';

/**
 * Keeps the screen on while `active` (the teacher's QR must not dim mid-class). The browser drops
 * the lock when the tab is hidden, so it is taken again when the tab comes back. Does nothing
 * where the Screen Wake Lock API is missing (older iPhones) or refuses (battery saver).
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let stopped = false;
    const take = async () => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) void next.release();
        else lock = next;
      } catch {
        // Refused (low battery, not visible): the screen may dim, nothing else breaks.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void take();
    };
    void take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}
