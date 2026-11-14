import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppDispatch } from '@/store';
import { getAccessToken } from './base';
import { streamEvents } from './sse';

const body = (...chunks: string[]) =>
  new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
      c.close();
    },
  });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('streamEvents', () => {
  it('refreshes first, reads events split across chunks, skips pings and reconnects', async () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(body('event: ping\n\ndata: {"n":', '1}\n\ndata: {"n":2}\n\n')),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    const dispatch = vi.fn(async () => {}) as unknown as AppDispatch;
    const seen: unknown[] = [];
    const done = streamEvents(
      '/api/v1/sessions/x/live',
      dispatch,
      (d) => seen.push(d),
      ctrl.signal,
    );
    await vi.advanceTimersByTimeAsync(6_000);
    await done;
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(dispatch).toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
  });

  it('stops quietly when aborted mid-request', async () => {
    const ctrl = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        ctrl.abort();
        throw new DOMException('aborted', 'AbortError');
      }),
    );
    await expect(
      streamEvents('/x', vi.fn() as unknown as AppDispatch, () => {}, ctrl.signal),
    ).resolves.toBeUndefined();
  });
});
