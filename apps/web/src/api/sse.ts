import { WORKSPACE_HEADER } from '@dafter/contracts';
import type { AppDispatch } from '@/store';
import { clearAccessToken, getAccessToken, getWorkspaceId } from './base';
import { api } from './generated';

const BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * Reads a server-sent-events stream with fetch, because EventSource cannot send the
 * Authorization header (a token in the URL would land in logs). Reconnects after 2 s until
 * `signal` aborts; before each connect a cheap GET /me refreshes the access token if needed.
 */
export async function streamEvents<T>(
  path: string,
  dispatch: AppDispatch,
  onData: (data: T) => void,
  signal: AbortSignal,
) {
  while (!signal.aborted) {
    try {
      if (!getAccessToken())
        await dispatch(api.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
      const res = await fetch(`${BASE}${path}`, {
        headers: {
          authorization: `Bearer ${getAccessToken() ?? ''}`,
          [WORKSPACE_HEADER]: getWorkspaceId() ?? '',
        },
        signal,
      });
      if (res.status === 401) clearAccessToken();
      else if (!res.ok) return; // 404 and friends: retrying will not help
      if (res.ok && res.body) {
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          // Events end with a blank line; a chunk may stop in the middle of one.
          const events = buffer.split('\n\n');
          buffer = events.pop()!;
          for (const event of events) {
            if (/^event: ping$/m.test(event)) continue;
            const data = event.match(/^data: (.*)$/m)?.[1];
            if (data) onData(JSON.parse(data) as T);
          }
        }
      }
    } catch {
      if (signal.aborted) return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
