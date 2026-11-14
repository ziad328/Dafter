import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string };

/** One option per value, first label wins (a list of groups names each teacher many times). */
export const uniqueOptions = (options: Option[]) => [
  ...new Map(options.map((o) => [o.value, o])).values(),
];

/** "All" and one pill per option; nothing when there is nothing to choose between. */
export function FilterChips({
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
  if (options.length < 2) return null;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {[{ value: '', label: t('filters.all') }, ...options].map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 rounded-full border px-4 text-sm font-medium transition-colors',
            value === o.value
              ? 'border-ink bg-ink text-primary-foreground'
              : 'bg-card hover:bg-ink-soft',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
