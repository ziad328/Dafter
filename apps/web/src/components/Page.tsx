import { type LucideIcon, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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

// One accent and one neutral (60/30/10): status colours never decorate.
const TONES = ['bg-ink-soft text-ink', 'bg-violet-soft text-violet'];

// Words most centers start with: «سنتر النور» and «سنتر الأمل» would both read «سن» (audit 3 A9).
const GENERIC = new Set(['سنتر', 'دروس', 'مركز', 'center', 'centre']);

/** Initials in a circle; the colour follows the name, so a person keeps theirs everywhere. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const all = name.trim().split(/\s+/);
  const named = all.filter((w) => !GENERIC.has(w.toLowerCase()));
  // «ال» is the article, not the word: «أحمد الشريف» is «أش», not «أا».
  const words = (named.length ? named : all).map((w) =>
    w.startsWith('ال') && w.length > 3 ? w.slice(2) : w,
  );
  // One word left after dropping «سنتر»: two of its letters, «سنتر النور» is «نو».
  const initials =
    named.length === 1 && all.length > 1
      ? words[0]!.slice(0, 2)
      : (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
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

/** A bottom sheet on phones, a centred dialog on laptops; children mount only while open. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="mx-auto mb-0 mt-auto max-h-[92dvh] w-full max-w-md overflow-hidden rounded-t-3xl bg-card text-foreground shadow-card backdrop:bg-black/40 sm:mb-auto sm:rounded-3xl"
    >
      {/* The sheet scrolls inside, with the floating bar. */}
      <ScrollArea className="max-h-[92dvh]" viewportClassName="max-h-[inherit] p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button size="icon" variant="ghost" aria-label={t('payments.close')} onClick={onClose}>
            <X aria-hidden />
          </Button>
        </div>
        {open && children}
      </ScrollArea>
    </dialog>
  );
}

/** The tinted icon square that opens a signed-out screen's card. */
export function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-ink-soft text-ink">
      <Icon className="size-6" aria-hidden />
    </span>
  );
}
