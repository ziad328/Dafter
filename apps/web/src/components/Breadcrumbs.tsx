import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, matchPath, useLocation } from 'react-router';
import { useGetGroupQuery, useGetStudentQuery } from '@/api/generated';
import { itemName } from '@/lib/groups';
import { cn } from '@/lib/utils';

type Crumb = { label: string; to?: string };

/** A student's or group's name for the last crumb; RTK shares the page's own request. */
function useName(kind: 'student' | 'group', id?: string) {
  const { i18n } = useTranslation();
  const valid = !!id && id !== 'new';
  const student = useGetStudentQuery({ id: id! }, { skip: kind !== 'student' || !valid }).data;
  const group = useGetGroupQuery({ id: id! }, { skip: kind !== 'group' || !valid }).data;
  if (student) return i18n.language === 'en' && student.nameEn ? student.nameEn : student.nameAr;
  if (group) return itemName(group.subject, i18n.language);
  return undefined;
}

/**
 * The way back from a detail screen ("Students › Ahmed Khaled"). Top-level screens have none;
 * the screens reached through "More" show it on phones only, where "More" is their parent.
 */
export function Breadcrumbs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const student = matchPath('/students/:id', pathname)?.params.id;
  const groupEdit = matchPath('/groups/:id/edit', pathname)?.params.id;
  const groupExams = matchPath('/groups/:id/exams', pathname)?.params.id;
  const group = matchPath('/groups/:id', pathname)?.params.id ?? groupEdit ?? groupExams;
  const studentName = useName('student', student);
  const groupName = useName('group', group);

  let crumbs: Crumb[] = [];
  let phoneOnly = false;
  if (student)
    crumbs = [
      { label: t('nav.students'), to: '/students' },
      { label: student === 'new' ? t('students.new') : (studentName ?? '') },
    ];
  else if (groupEdit || groupExams)
    crumbs = [
      { label: t('nav.groups'), to: '/groups' },
      { label: groupName ?? '', to: `/groups/${group}` },
      { label: t(groupEdit ? 'groups.editShort' : 'exams.title') },
    ];
  else if (group)
    crumbs = [
      { label: t('nav.groups'), to: '/groups' },
      { label: group === 'new' ? t('groups.new') : (groupName ?? '') },
    ];
  else if (matchPath('/sessions/:id/live', pathname))
    crumbs = [{ label: t('nav.today'), to: '/' }, { label: t('nav.live') }];
  else if (pathname === '/messages/settings')
    crumbs = [
      { label: t('nav.messages'), to: '/messages' },
      { label: t('messages.settingsTitle') },
    ];
  else if (matchPath('/receipts/:id', pathname))
    crumbs = [{ label: t('nav.students'), to: '/students' }, { label: t('nav.receipt') }];
  else {
    const more: Record<string, string> = {
      '/messages': t('nav.messages'),
      '/members': t('nav.staff'),
      '/cash-summary': t('nav.cashSummary'),
      '/rooms': t('nav.rooms'),
      '/settings': t('nav.settings'),
      '/dev/phone': t('nav.phone'),
      '/workspaces': t('workspaces.title'),
    };
    if (more[pathname]) {
      crumbs = [{ label: t('nav.more'), to: '/more' }, { label: more[pathname] }];
      phoneOnly = true;
    }
  }
  if (!crumbs.length) return null;

  return (
    <nav aria-label={t('nav.breadcrumbs')} className={cn('print:hidden', phoneOnly && 'lg:hidden')}>
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <ChevronLeft
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground ltr:-scale-x-100"
              />
            )}
            {c.to ? (
              <Link
                to={c.to}
                className="rounded-md px-1 text-muted-foreground transition-colors hover:text-ink focus-visible:outline-2"
              >
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="block truncate px-1 font-semibold">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
