import { ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { AccountActions, useNavItems } from '@/components/AppShell';

const SECTIONS = ['daily', 'money', 'admin'] as const;
const row = 'flex min-h-12 items-center gap-3 px-4 text-sm font-medium';

/**
 * The phone's "More" tab: the screens that don't fit the bottom bar in three short sections
 * (audit 3 N1), then language, theme and sign-out.
 */
export default function More() {
  const { t } = useTranslation();
  const { more } = useNavItems();
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold">{t('nav.more')}</h1>
      <nav aria-label={t('nav.more')} className="grid gap-4">
        {SECTIONS.map((section) => {
          const items = more.filter((i) => i.section === section);
          const switcher = section === 'admin';
          if (!items.length && !switcher) return null;
          return (
            <section key={section} className="grid gap-1.5">
              <h2 className="px-1 text-xs font-semibold text-muted-foreground">
                {t(`nav.sections.${section}`)}
              </h2>
              <div className="divide-y rounded-2xl border bg-card">
                {items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className={row}>
                    <Icon className="size-5 text-ink" aria-hidden />
                    {label}
                  </NavLink>
                ))}
                {switcher && (
                  <NavLink to="/workspaces" className={row}>
                    <ArrowLeftRight className="size-5 text-ink" aria-hidden />
                    {t('nav.switchWorkspace')}
                  </NavLink>
                )}
              </div>
            </section>
          );
        })}
      </nav>
      <AccountActions />
    </div>
  );
}
