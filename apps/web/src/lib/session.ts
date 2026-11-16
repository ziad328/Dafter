import { ERROR_CODES, type ErrorCode, type Workspace } from '@dafter/contracts';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { setWorkspaceId } from '@/api/base';
import { api, useLogoutMutation } from '@/api/generated';

/** The i18n key for an RTK Query error: errors.<CODE>, or errors.INTERNAL for anything unknown. */
export function errorKey(error: unknown): `errors.${ErrorCode}` {
  const code = (error as { data?: { code?: unknown } } | undefined)?.data?.code;
  return `errors.${ERROR_CODES.includes(code as ErrorCode) ? (code as ErrorCode) : 'INTERNAL'}`;
}

/** The error's details when its code is `code` (GROUP_FULL's count, a clash's times), else undefined. */
export function errorDetails(error: unknown, code: ErrorCode): Record<string, string> | undefined {
  const data = (
    error as { data?: { code?: unknown; details?: Record<string, string> } } | undefined
  )?.data;
  return data?.code === code ? (data.details ?? {}) : undefined;
}

/**
 * The translated message for an error. RATE_LIMITED says how long to wait, «حاول بعد 15 دقيقة»,
 * from the API's retryAfterSeconds (audit 3 A3); other codes read as errorKey does.
 */
export function errorText(t: TFunction, error: unknown): string {
  const wait = Number(errorDetails(error, 'RATE_LIMITED')?.retryAfterSeconds);
  if (wait > 0) return t('errors.retryIn', { minutes: Math.ceil(wait / 60) });
  return t(errorKey(error));
}

/** «مدرّس مستقل» for the owner of an independent workspace, else the role (audit 3 A8). */
export const workspaceRole = (t: TFunction, ws: Pick<Workspace, 'type' | 'role'>) =>
  t(
    ws.type === 'independent' && ws.role === 'owner'
      ? 'workspaces.create.independent'
      : `roles.${ws.role}`,
  );

export const workspaceName = (ws: Pick<Workspace, 'nameAr' | 'nameEn'>, lang: string) =>
  lang === 'en' && ws.nameEn ? ws.nameEn : ws.nameAr;

/** Only same-app paths, so ?next= cannot send the user to another site. */
export function safeNext(next: string | null): string {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/** Switching workspace drops every cached query, so no screen shows the old tenant's data. */
export function useSelectWorkspace() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  return useCallback(
    (id: string) => {
      setWorkspaceId(id);
      dispatch(api.util.resetApiState());
      void navigate('/');
    },
    [dispatch, navigate],
  );
}

export function useSignOut(to = '/login') {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();
  return async () => {
    await logout();
    dispatch(api.util.resetApiState());
    void navigate(to);
  };
}
