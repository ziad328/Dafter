import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './wake-lock';

const flush = () => act(() => Promise.resolve());

function fakeWakeLock(request: () => Promise<{ release: () => Promise<void> }>) {
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
}

afterEach(() => {
  // @ts-expect-error: removing the stub puts the jsdom navigator back as it was.
  delete navigator.wakeLock;
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('takes the lock while active, again when the tab comes back, and releases it', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release }));
    fakeWakeLock(request);
    const { rerender, unmount } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: false },
    });
    expect(request).not.toHaveBeenCalled();
    rerender({ on: true });
    await flush();
    expect(request).toHaveBeenCalledWith('screen');

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);

    unmount();
    expect(release).toHaveBeenCalled();
  });

  it('releases a lock that arrives after the screen closed, and survives a refusal', async () => {
    let resolve!: (l: { release: () => Promise<void> }) => void;
    const release = vi.fn(() => Promise.resolve());
    fakeWakeLock(() => new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();
    resolve({ release });
    await flush();
    expect(release).toHaveBeenCalled();

    fakeWakeLock(() => Promise.reject(new Error('NotAllowedError')));
    const refused = renderHook(() => useWakeLock(true));
    await flush();
    refused.unmount();
  });

  it('does nothing without the API', () => {
    expect(() => renderHook(() => useWakeLock(true)).unmount()).not.toThrow();
  });
});
