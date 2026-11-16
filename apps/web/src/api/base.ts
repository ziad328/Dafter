import { type AuthResponse, WORKSPACE_HEADER } from '@dafter/contracts';
import {
  type BaseQueryFn,
  createApi,
  type FetchArgs,
  fetchBaseQuery,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';

const AUTH_PREFIX = '/api/v1/auth/';
const REFRESH_URL = `${AUTH_PREFIX}refresh`;
// GET /api/v1/invites/<token>: the invite page reads it before sign-in.
const PUBLIC_READ = /^\/api\/v1\/invites\/[^/]+$/;
const WORKSPACE_KEY = 'dafter.workspace';

// Memory only: a reload loses it and the refresh cookie gets a new one.
let accessToken: string | null = null;
let workspaceId: string | null = readWorkspace();

function readWorkspace(): string | null {
  try {
    return localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export const getWorkspaceId = () => workspaceId;

export function setWorkspaceId(id: string | null) {
  workspaceId = id;
  try {
    if (id) localStorage.setItem(WORKSPACE_KEY, id);
    else localStorage.removeItem(WORKSPACE_KEY);
  } catch {
    // Blocked storage: the choice lasts until reload.
  }
}

export const getAccessToken = () => accessToken;

export const clearAccessToken = () => {
  accessToken = null;
};

const raw = fetchBaseQuery({
  // Empty in local dev: Vite proxies /api and /health to the API, so no CORS is needed.
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  credentials: 'include',
  prepareHeaders: (headers) => {
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    if (workspaceId) headers.set(WORKSPACE_HEADER, workspaceId);
    return headers;
  },
});

type Result = Awaited<ReturnType<typeof raw>>;
type Api = Parameters<typeof raw>[1];

// The refresh token rotates and reuse revokes the whole family, so two refreshes in flight
// would sign the user out. Every caller shares this one promise.
let refreshing: Promise<Result> | null = null;

function refreshOnce(api: Api, extra: object): Promise<Result> {
  refreshing ??= Promise.resolve(raw({ url: REFRESH_URL, method: 'POST' }, api, extra))
    .then((result) => {
      accessToken = result.data ? (result.data as AuthResponse).accessToken : null;
      return result;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const urlOf = (args: string | FetchArgs) => (typeof args === 'string' ? args : args.url);

export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extra = {},
) => {
  const url = urlOf(args);
  if (url === REFRESH_URL) return refreshOnce(api, extra);
  if (!url.startsWith('/api/')) return raw(args, api, extra); // /health is public

  if (url.startsWith(AUTH_PREFIX)) {
    // Login, register and logout: their 401s are answers, never a reason to refresh.
    const result = await raw(args, api, extra);
    if (url.endsWith('/logout')) accessToken = null;
    else if (result.data) accessToken = (result.data as AuthResponse).accessToken;
    return result;
  }

  // After a reload there is no token yet: refresh first instead of earning a 401.
  // After a reload there is no token yet: refresh first instead of earning a 401. Signed out, only
  // the public invite preview goes out; everything else is answered 401 here.
  if (!accessToken && !(await refreshOnce(api, extra)).data) {
    if (PUBLIC_READ.test(url)) return raw(args, api, extra);
    return { error: { status: 401, data: { code: 'UNAUTHENTICATED' } } };
  }

  const sent = accessToken;
  const result = await raw(args, api, extra);
  if (result.error?.status !== 401) return result;
  // Another request may have refreshed while this one was in flight; only refresh if not.
  if (accessToken === sent && !(await refreshOnce(api, extra)).data) return result;
  return raw(args, api, extra);
};

/** Endpoints are injected by the generated file; never add them by hand. */
export const baseApi = createApi({ baseQuery, endpoints: () => ({}) });
