import { useTranslation } from 'react-i18next';
import { useGetHealthQuery } from './api/generated';

export function App() {
  const { t, i18n } = useTranslation();
  const health = useGetHealthQuery();
  const other = i18n.language === 'ar' ? 'en' : 'ar';

  const apiStatus = health.isLoading
    ? t('shell.api.checking')
    : health.isSuccess
      ? t('shell.api.ok')
      : t('shell.api.down');

  return (
    <div className="min-h-dvh bg-stone-50 font-sans text-stone-900">
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 px-4 py-3">
        <span className="text-xl font-bold">{t('app.name')}</span>
        <button
          type="button"
          lang={other}
          onClick={() => void i18n.changeLanguage(other)}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
        >
          {t('shell.switchLanguage')}
        </button>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8">
        <p className="text-lg">{t('app.tagline')}</p>
        <p role="status" className="mt-4 text-sm text-stone-600">
          {apiStatus}
        </p>
      </main>
    </div>
  );
}
