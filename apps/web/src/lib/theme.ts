import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'dafter.theme';
const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/** The viewer's own choice, if they made one; otherwise the phone's setting decides. */
function saved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme = saved() ?? (darkQuery()?.matches ? 'dark' : 'light')) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  return theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => applyTheme());
  // Follow the phone switching to night mode, until the viewer picks one here.
  useEffect(() => {
    const query = darkQuery();
    const follow = () => !saved() && setTheme(applyTheme());
    query?.addEventListener('change', follow);
    return () => query?.removeEventListener('change', follow);
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice lasts until the page closes.
    }
    setTheme(applyTheme(next));
  };
  return { theme, toggle };
}
