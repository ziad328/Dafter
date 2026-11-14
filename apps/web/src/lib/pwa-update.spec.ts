import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryOnce } from './lazy-page';
import { keepUpdated } from './sw-update';

describe('retryOnce (a screen chunk missing after a deploy)', () => {
  const reload = vi.fn();
  const original = window.location;
  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
    vi.restoreAllMocks();
  });

  it('passes a working import through', async () => {
    await expect(retryOnce(() => Promise.resolve('page'))).resolves.toBe('page');
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once, then shows the error if the new page fails too', async () => {
    const gone = new TypeError('Failed to fetch dynamically imported module');
    void retryOnce(() => Promise.reject(gone));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    await expect(retryOnce(() => Promise.reject(gone))).rejects.toBe(gone);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    void retryOnce(() => Promise.reject(new Error('gone')));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});

describe('keepUpdated (the installed app follows new deploys)', () => {
  afterEach(() => vi.useRealTimers());

  it('registers at once, then checks for a new build hourly and when the app is shown', () => {
    vi.useFakeTimers();
    const update = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const registerSW = vi.fn();
    keepUpdated(registerSW);
    const options = registerSW.mock.calls[0]![0];
    expect(options.immediate).toBe(true);
    options.onRegisteredSW('/sw.js', undefined); // no service worker support: nothing to do
    options.onRegisteredSW('/sw.js', { update } as unknown as ServiceWorkerRegistration);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(2);
  });
});
