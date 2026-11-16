import { ScrollArea as Primitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * A scroll box whose bar floats over the content: thin, no arrows, no track, and shown only
 * while scrolling, so it never takes width or shifts the layout. The browser's own bars are
 * hidden app-wide (index.css), so every scrolling box uses this. `tone="light"` on dark surfaces.
 */
export function ScrollArea({
  className,
  viewportClassName,
  tone = 'dark',
  children,
}: {
  className?: string;
  viewportClassName?: string;
  tone?: 'dark' | 'light';
  children: ReactNode;
}) {
  const { i18n } = useTranslation();
  return (
    <Primitive.Root
      type="scroll"
      scrollHideDelay={600}
      dir={i18n.dir()}
      className={cn('relative overflow-hidden', className)}
    >
      {/* Radix wraps the content in a `display: table` box; block keeps grids and min-h-full working. */}
      <Primitive.Viewport
        className={cn('size-full rounded-[inherit] [&>div]:!block', viewportClassName)}
      >
        {children}
      </Primitive.Viewport>
      <Primitive.Scrollbar
        orientation="vertical"
        className="z-10 flex w-2 touch-none p-0.5 select-none data-[state=hidden]:animate-out data-[state=hidden]:fade-out-0 data-[state=visible]:animate-in data-[state=visible]:fade-in-0"
      >
        <Primitive.Thumb
          className={cn(
            'relative flex-1 rounded-full',
            tone === 'light' ? 'bg-white/30' : 'bg-ink/30',
          )}
        />
      </Primitive.Scrollbar>
    </Primitive.Root>
  );
}
