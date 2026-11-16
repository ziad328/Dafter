import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** How long the thumb stays after the last scroll, like the boxes' ScrollArea. */
export const HIDE_MS = 600;

/**
 * The page's own scrollbar, drawn over the content at the inline end: the browser's bar is hidden
 * (index.css), so nothing takes width or shifts. It shows while the page scrolls and fades after.
 * The page keeps scrolling the window, so phones keep the collapsing address bar and pull-to-refresh.
 */
export function PageScrollbar() {
  const [thumb, setThumb] = useState({ top: 0, size: 100, shown: false });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const { scrollHeight, clientHeight } = document.documentElement;
      setThumb({
        top: (window.scrollY / scrollHeight) * 100,
        size: (clientHeight / scrollHeight) * 100,
        shown: true,
      });
      clearTimeout(timer);
      timer = setTimeout(() => setThumb((t) => ({ ...t, shown: false })), HIDE_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      data-testid="page-scrollbar"
      data-shown={thumb.shown}
      className="pointer-events-none fixed inset-y-0 end-0 z-50 w-2 print:hidden"
    >
      <div
        className={cn(
          'absolute end-0.5 w-1.5 rounded-full bg-ink/30 transition-opacity duration-300',
          thumb.shown && thumb.size < 100 ? 'opacity-100' : 'opacity-0',
        )}
        style={{ top: `${thumb.top}%`, height: `${thumb.size}%` }}
      />
    </div>
  );
}
