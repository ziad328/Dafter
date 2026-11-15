import { normalizeArabic } from '@dafter/contracts';
import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Page';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string };

/** One option per value, first label wins (a list of groups names each teacher many times). */
export const uniqueOptions = (options: Option[]) => [
  ...new Map(options.map((o) => [o.value, o])).values(),
];

/** The pill look shared by every filter in a filter row. */
export const pillClass = (on: boolean) =>
  cn(
    'inline-flex h-9 max-w-full items-center gap-1 rounded-full border px-4 text-sm font-medium transition-colors',
    on ? 'border-ink bg-ink text-primary-foreground' : 'bg-card hover:bg-ink-soft',
  );

/**
 * One pill that names the filter (or the choice made) and opens a sheet of choices, so a
 * center with a hundred groups gets one button, not a hundred chips (audit 3 S1). A search
 * box shows when the list is long. Nothing renders when there is nothing to choose between.
 */
export function FilterPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  if (options.length < 2) return null;
  const chosen = options.find((o) => o.value === value);
  const needle = normalizeArabic(q.trim().toLowerCase());
  const shown = needle
    ? options.filter((o) => normalizeArabic(o.label.toLowerCase()).includes(needle))
    : options;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={chosen ? `${label}: ${chosen.label}` : label}
        className={pillClass(!!chosen)}
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{chosen?.label ?? label}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="grid gap-3">
          {options.length > 8 && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                aria-label={t('filters.search')}
                placeholder={t('filters.search')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-11 w-full rounded-xl border bg-card ps-9 pe-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          <ul role="group" aria-label={label} className="grid divide-y rounded-xl border">
            {[{ value: '', label: t('filters.all') }, ...shown].map((o) => (
              <li key={o.value || 'all'}>
                <button
                  type="button"
                  aria-pressed={value === o.value}
                  onClick={() => pick(o.value)}
                  className={cn(
                    'flex min-h-11 w-full items-center px-4 py-2 text-start text-sm transition-colors hover:bg-ink-soft',
                    value === o.value && 'font-semibold text-ink',
                  )}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}
