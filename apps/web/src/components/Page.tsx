import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A screen's title, an optional line under it, and its one main action on the end side. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-0.5">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

const TONES = [
  'bg-ink-soft text-ink',
  'bg-violet-soft text-violet',
  'bg-teal-soft text-teal',
  'bg-amber-soft text-amber',
  'bg-rose-soft text-rose',
];

/** Initials in a circle; the colour follows the name, so a person keeps theirs everywhere. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const words = name.trim().split(/\s+/);
  const initials = (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold',
        TONES[Math.abs(hash) % TONES.length],
        className,
      )}
    >
      {initials}
    </span>
  );
}

/** The white rounded surface every list and form sits on. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border bg-card shadow-card', className)}>{children}</div>;
}
