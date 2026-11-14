import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('start-up', () => {
  it('falls back to Arabic when storage is blocked', async () => {
    vi.resetModules();
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { i18n } = await import('./i18n');
    expect(i18n.language).toBe('ar');
    spy.mockRestore();
  });

  it('renders the app into #root', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    await import('./main');
    expect(await screen.findByText('دفتر')).toBeInTheDocument();
  });

  it('registers the service worker in a production build', async () => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    const registerSW = vi.fn();
    vi.doMock('virtual:pwa-register', () => ({ registerSW }));
    document.body.innerHTML = '<div id="root"></div>';
    await import('./main');
    await vi.waitFor(() =>
      expect(registerSW).toHaveBeenCalledWith(expect.objectContaining({ immediate: true })),
    );
    vi.doUnmock('virtual:pwa-register');
    vi.unstubAllEnvs();
  });
});
