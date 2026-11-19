import type { GroupTrend, WeekCount } from '@dafter/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  type GetTrendStatsApiArg,
  useGetCurrentWorkspaceQuery,
  useGetTrendStatsQuery,
} from '@/api/generated';
import { Field, FormError, Skeleton } from '@/components/Field';
import { PageHeader, Panel } from '@/components/Page';
import { itemName } from '@/lib/groups';
import { formatEgp } from '@/lib/money';
import { errorKey } from '@/lib/session';
import { addDays, intlLocale, localDate, monthLabel } from '@/lib/time';
import { cn } from '@/lib/utils';

const rate = (c: WeekCount) => (c.total ? Math.round((c.present / c.total) * 100) : null);
const sum = (cs: WeekCount[]) =>
  cs.reduce((a, c) => ({ present: a.present + c.present, total: a.total + c.total }), {
    present: 0,
    total: 0,
  });

type Range = NonNullable<GetTrendStatsApiArg['weeks']> | 'custom';
const RANGES: Range[] = ['8', '13', '26', 'custom'];
/** The longest custom range the API takes: a year. */
const MAX_DAYS = 365;

/**
 * Trends for the groups the caller can see: attendance per week, exam averages per group, and
 * (owner and assistant) money in per month.
 */
export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const tz = useGetCurrentWorkspaceQuery().data?.timezone ?? 'Africa/Cairo';
  const today = localDate(new Date(), tz);
  // 8 weeks, a term (13) or half a year (26) with 6 months of money; or the owner's own dates
  // (a term's real start and end), with the money of those months.
  const [range, setRange] = useState<Range>('8');
  const [from, setFrom] = useState(() => addDays(today, -55));
  const [to, setTo] = useState(today);
  const [archived, setArchived] = useState(false);
  const custom = range === 'custom';
  // Checked here so a half-typed date never reaches the API.
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  const badRange = custom && !(days >= 0 && days <= MAX_DAYS);
  const args: GetTrendStatsApiArg = {
    ...(custom ? { from, to } : { weeks: range }),
    ...(archived && { archived: 'true' }),
  };
  // While the dates are wrong, the last good range stays on screen.
  const shownArgs = useRef(args);
  if (!badRange) shownArgs.current = args;
  const { data, isLoading, isFetching, error } = useGetTrendStatsQuery(shownArgs.current);
  if (isLoading) return <Skeleton />;
  if (error) return <FormError message={t(errorKey(error))} />;
  const { weeks, groups, money } = data!;
  // «14/11»: «14 نوفمبر» was cut on a phone (audit 3 D2).
  const week = (date: string) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
  // The value above each money bar, short: «12.5 ألف» / «12.5K».
  const short = new Intl.NumberFormat(intlLocale(lang), {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const overall = weeks.map((_, i) => sum(groups.map((g) => g.attendance[i]!)));
  const total = rate(sum(overall));

  return (
    <div className="grid gap-5">
      {/* No subtitle: the pressed chip already says how many weeks (audit 3 D3). */}
      <PageHeader title={t('dashboard.title')} />
      <div
        role="group"
        aria-label={t('dashboard.range')}
        aria-busy={isFetching}
        className="flex gap-2"
      >
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            className={cn(
              'h-9 rounded-full border px-4 text-sm font-medium transition-colors',
              range === r
                ? 'border-ink bg-ink text-primary-foreground'
                : 'bg-card hover:bg-ink-soft',
            )}
          >
            {r === 'custom' ? t('dashboard.custom') : t('dashboard.weeks', { count: Number(r) })}
          </button>
        ))}
      </div>
      {custom && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label={t('dashboard.from')}
            type="date"
            dir="ltr"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Field
            label={t('dashboard.to')}
            type="date"
            dir="ltr"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            error={badRange ? t('dashboard.badRange') : undefined}
          />
        </div>
      )}
      <label className="flex min-h-10 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-ink"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        {t('dashboard.withArchived')}
      </label>

      <Panel className="grid gap-4 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">{t('dashboard.attendance')}</h2>
          {total !== null && <bdi className="text-2xl font-bold text-present">{`${total}%`}</bdi>}
        </div>
        <Bars
          top={100}
          label={t('dashboard.attendance')}
          items={overall.map((c, i) => ({
            key: weeks[i]!,
            label: week(weeks[i]!),
            value: rate(c),
            text: rate(c) === null ? t('dashboard.noRecords') : `${rate(c)}%`,
          }))}
        />
      </Panel>

      {money && (
        <section data-testid="money-trend">
          <Panel className="grid gap-4 p-5">
            <h2 className="font-semibold">{t('dashboard.money')}</h2>
            <Bars
              label={t('dashboard.money')}
              items={money.map((m) => ({
                key: m.month,
                label: monthLabel(m.month, lang).split(' ')[0]!,
                value: m.total,
                text: formatEgp(m.total, lang),
                above: short.format(m.total / 100),
              }))}
            />
          </Panel>
        </section>
      )}

      <GroupList groups={groups} />
    </div>
  );
}

/** How many group rows show before «عرض الكل». */
const FIRST = 10;

/**
 * One short row per group, lowest attendance first, so the groups that need a look come first
 * (audit 3 D1). The per-group charts are gone: a phone showed ~20,000 px of them.
 */
function GroupList({ groups }: { groups: GroupTrend[] }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const sorted = [...groups].sort(
    (a, b) => (rate(sum(a.attendance)) ?? 101) - (rate(sum(b.attendance)) ?? 101),
  );
  const shown = all ? sorted : sorted.slice(0, FIRST);
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{t('dashboard.groups')}</h2>
      {groups.length === 0 ? (
        <Panel className="p-8 text-center text-muted-foreground">{t('dashboard.empty')}</Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y">
            {shown.map((g) => (
              <GroupRow key={g.id} group={g} />
            ))}
          </ul>
          {sorted.length > FIRST && !all && (
            <button
              type="button"
              className="w-full border-t px-4 py-3 text-sm font-medium text-ink hover:bg-ink-soft/50"
              onClick={() => setAll(true)}
            >
              {t('dashboard.showAll', { count: sorted.length })}
            </button>
          )}
        </Panel>
      )}
    </section>
  );
}

function GroupRow({ group: g }: { group: GroupTrend }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const r = rate(sum(g.attendance));
  const graded = g.exams.filter((e) => e.averagePct !== null);
  const last = graded.at(-1);
  const name = `${itemName(g.subject, lang)} · ${itemName(g.gradeLevel, lang)}${g.label ? ` · ${g.label}` : ''}${g.archived ? ` · ${t('groups.archived')}` : ''}`;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="grid min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold">{name}</h3>
        <Link
          to={`/groups/${g.id}/exams`}
          className="truncate text-xs text-muted-foreground hover:underline"
        >
          {g.teacherName}
          {' · '}
          {t('dashboard.exams', { count: graded.length })}
          {last && (
            <>
              {' · '}
              <bdi>{t('dashboard.lastAverage', { pct: last.averagePct })}</bdi>
            </>
          )}
        </Link>
      </div>
      <bdi
        className={cn(
          'shrink-0 font-bold',
          r === null ? 'text-sm text-muted-foreground' : r < 70 ? 'text-rose' : 'text-present',
        )}
      >
        {r === null ? '—' : `${r}%`}
      </bdi>
    </li>
  );
}

type Bar = { key: string; label: string; value: number | null; text: string; above?: string };

/** A row of bars scaled to the largest value; the text of each bar is read by screen readers. */
function Bars({
  items,
  label,
  small,
  top = Math.max(1, ...items.map((b) => b.value ?? 0)),
}: {
  items: Bar[];
  label: string;
  small?: boolean;
  // The value of a full bar: 100 for rates, the largest value otherwise.
  top?: number;
}) {
  // More than 8 bars (13 or 26 weeks) are too narrow for a label each at 375 px: one axis row
  // under them with 4 labels, the first and last flush with the edges.
  const axis = !small && items.length > 8;
  const ticks = [
    0,
    Math.round(items.length / 3),
    Math.round((2 * items.length) / 3),
    items.length - 1,
  ];
  const bars = (
    <ol className={cn('flex items-end', axis ? 'gap-0.5' : 'gap-1.5')} aria-label={label}>
      {items.map((b, i) => (
        <li key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className={cn('flex w-full flex-col justify-end', small ? 'h-12' : 'h-28')}
            title={b.text}
          >
            {b.above !== undefined && (
              <bdi
                aria-hidden="true"
                className="h-4 shrink-0 truncate text-center text-[10px] leading-4 text-muted-foreground"
              >
                {b.above}
              </bdi>
            )}
            <div
              className={cn(
                'w-full rounded-t-md',
                axis && 'rounded-t-sm',
                i === items.length - 1 ? 'bg-chart-1' : 'bg-chart-1/30',
                b.value === null && 'bg-muted',
              )}
              // A value above the bar takes 1rem of the column's height.
              style={{
                height: `calc((100% - ${b.above === undefined ? '0rem' : '1rem'}) * ${Math.max((b.value ?? 0) / top, 0.04)})`,
              }}
            />
          </div>
          {!small && !axis && (
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">
              {b.label}
            </span>
          )}
          <span className="sr-only">{`${b.label}: ${b.text}`}</span>
        </li>
      ))}
    </ol>
  );
  if (!axis) return bars;
  return (
    <div className="grid gap-1">
      {bars}
      <div
        aria-hidden="true"
        data-testid="bar-axis"
        className="flex justify-between text-[10px] text-muted-foreground"
      >
        {ticks.map((i) => (
          <span key={i}>{items[i]!.label}</span>
        ))}
      </div>
    </div>
  );
}
