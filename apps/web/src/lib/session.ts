import { ERROR_CODES, type ErrorCode, type Workspace } from '@dafter/contracts';
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

export const workspaceName = (ws: Workspace, lang: string) =>
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

export function useSignOut() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();
  return async () => {
    await logout();
    dispatch(api.util.resetApiState());
    void navigate('/login');
  };
}
