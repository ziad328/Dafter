import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

const HOUR = 60 * 60 * 1000;

/**
 * Keeps the installed app on the latest deploy. The service worker is registered at start-up;
 * it then looks for a new build every hour and whenever the app comes back to the screen (a PWA
 * can stay open in the background for days). With registerType 'autoUpdate', the new worker
 * takes over and the page reloads itself onto the new build.
 */
export function keepUpdated(registerSW: (options: RegisterSWOptions) => unknown) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Offline or a deploy in progress: try again at the next check.
      const check = () => void registration.update().catch(() => {});
      setInterval(check, HOUR);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}
