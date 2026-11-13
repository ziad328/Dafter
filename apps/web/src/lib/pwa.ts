import { useEffect, useState } from 'react';

const INVITE_KEY = 'dafter.invite';
// Development only: Playwright cannot install the app, so e2e sets this to pass the gate.
const DEV_INSTALLED_KEY = 'dafter.devInstalled';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Blocked storage: the student pastes the link instead.
  }
}

/** Running as the installed app (rule 13: login and binding only happen here). */
export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true ||
  (import.meta.env.DEV && read(DEV_INSTALLED_KEY) === '1');

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * The invite token, kept between the browser tab and the installed app. On Android they share
 * storage, so this carries it across; on iPhone they do not, so the student pastes the link.
 */
export const savedInvite = () => read(INVITE_KEY);
export const saveInvite = (token: string | null) => write(INVITE_KEY, token);

/** The token from a pasted invite link (or the bare token). */
export const inviteFromText = (text: string) =>
  text.trim().match(/(?:\/s\/activate\/)?([\w-]{20,100})\/?$/)?.[1];

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

/** Android/Chrome's install prompt, when the browser offers one. */
export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallEvent>();
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  return event && (() => void event.prompt());
}
