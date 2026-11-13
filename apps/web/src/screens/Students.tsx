import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useListStudentsQuery } from '@/api/generated';
import { Field, FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { itemName } from '@/lib/groups';
import { errorKey } from '@/lib/session';

export default function Students() {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  // Debounced: one request after typing pauses, not one per key.
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const list = useListStudentsQuery({ q: q || undefined });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('students.title')}</h1>
        <Button asChild size="sm">
          <Link to="/students/new">{t('students.new')}</Link>
        </Button>
      </div>
      <Field
        label={t('students.search')}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <FormError message={list.error && t(errorKey(list.error))} />
      {list.isLoading && <Skeleton />}
      {list.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t(q ? 'students.noResults' : 'students.empty')}
        </p>
      )}
      {list.data?.map((s) => (
        <Link key={s.id} to={`/students/${s.id}`} className="rounded-xl focus-visible:ring-2">
          <Card className="gap-1 py-3">
            <CardHeader className="px-4">
              <CardTitle>
                <h2>{i18n.language === 'en' && s.nameEn ? s.nameEn : s.nameAr}</h2>
              </CardTitle>
              <CardDescription>
                {itemName(s.gradeLevel, i18n.language)}
                {s.phone && (
                  <>
                    {' · '}
                    <bdi>{s.phone}</bdi>
                  </>
                )}
                {s.status === 'archived' && ` · ${t('students.statuses.archived')}`}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
