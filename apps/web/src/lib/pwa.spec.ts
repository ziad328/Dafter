import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inviteFromText,
  isInstalled,
  isIos,
  saveInvite,
  savedInvite,
  useInstallPrompt,
} from './pwa';

const token = 'a'.repeat(32);

afterEach(() => vi.restoreAllMocks());

describe('pwa', () => {
  it('knows when it runs as the installed app', () => {
    expect(isInstalled()).toBe(false);
    localStorage.setItem('dafter.devInstalled', '1');
    expect(isInstalled()).toBe(true);
    localStorage.clear();
    const original = window.matchMedia;
    window.matchMedia = (q: string) => ({ ...original(q), matches: true });
    expect(isInstalled()).toBe(true);
    window.matchMedia = original;
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isInstalled()).toBe(true);
    delete (navigator as { standalone?: boolean }).standalone;
  });

  it('spots an iPhone', () => {
    expect(isIos()).toBe(false);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS)');
    expect(isIos()).toBe(true);
  });

  it('keeps the invite between the tab and the app, and survives blocked storage', () => {
    saveInvite(token);
    expect(savedInvite()).toBe(token);
    saveInvite(null);
    expect(savedInvite()).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(savedInvite()).toBeNull();
    expect(() => saveInvite(token)).not.toThrow();
  });

  it('reads the token from a pasted link or the bare token', () => {
    expect(inviteFromText(` https://dafter.app/s/activate/${token}/ `)).toBe(token);
    expect(inviteFromText(token)).toBe(token);
    expect(inviteFromText('hello')).toBeUndefined();
  });

  it('offers the browser’s install prompt once it fires', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current).toBeUndefined();
    const prompt = vi.fn(async () => {});
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt }));
    });
    result.current!();
    expect(prompt).toHaveBeenCalled();
  });
});
