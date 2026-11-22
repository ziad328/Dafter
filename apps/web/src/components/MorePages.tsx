import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormError, Skeleton } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { errorKey } from '@/lib/session';

type Page<T> = { data?: T[]; isLoading: boolean; error?: unknown };
type Props<T> = {
  // The first page, already shown by the screen.
  first: T[];
  // The API's page size: a full page may have more after it.
  size: number;
  // Loads the page after a row id (a hook: called once per page component).
  usePage: (after: string) => Page<T>;
  children: (rows: T[]) => ReactNode;
};

/**
 * Keyset "show more" under a list: each further page is its own cached query, asked with the last
 * row's id (the API's `after`). Give it a `key` of the list's filters, so a new filter starts over.
 */
export function MorePages<T extends { id: string }>({ first, size, usePage, children }: Props<T>) {
  const [cursors, setCursors] = useState<string[]>([]);
  const more = (rows: T[]) => () => setCursors((c) => [...c, rows.at(-1)!.id]);
  return (
    <>
      {cursors.map((after, i) => (
        <NextPage
          key={after}
          after={after}
          size={size}
          usePage={usePage}
          onMore={i === cursors.length - 1 ? more : undefined}
        >
          {children}
        </NextPage>
      ))}
      {cursors.length === 0 && first.length === size && <More onClick={more(first)} />}
    </>
  );
}

function NextPage<T extends { id: string }>({
  after,
  size,
  usePage,
  onMore,
  children,
}: Omit<Props<T>, 'first'> & { after: string; onMore?: (rows: T[]) => () => void }) {
  const { t } = useTranslation();
  const page = usePage(after);
  if (page.isLoading) return <Skeleton />;
  if (!page.data) return <FormError message={t(errorKey(page.error))} />;
  return (
    <>
      {children(page.data)}
      {onMore && page.data.length === size && <More onClick={onMore(page.data)} />}
    </>
  );
}

function More({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" className="w-full rounded-none border-t" onClick={onClick}>
      {t('list.more')}
    </Button>
  );
}
