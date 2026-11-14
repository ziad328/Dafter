import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { AccountActions, useNavItems } from '@/components/AppShell';

/** The phone's "More" tab: the screens that don't fit the bottom bar, language and sign-out. */
export default function More() {
  const { t } = useTranslation();
  const { more } = useNavItems();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">{t('nav.more')}</h1>
      <nav aria-label={t('nav.more')} className="divide-y rounded-lg border bg-card">
        {more.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex min-h-12 items-center gap-3 px-4 text-sm font-medium"
          >
            <Icon className="size-5 text-ink" aria-hidden />
            {label}
          </NavLink>
        ))}
        <NavLink
          to="/workspaces"
          className="flex min-h-12 items-center gap-3 px-4 text-sm font-medium"
        >
          {t('nav.switchWorkspace')}
        </NavLink>
      </nav>
      <AccountActions />
    </div>
  );
}
