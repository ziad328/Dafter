import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAt, tr } from '@/test/render';

const setOnline = (on: boolean) => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(on);
  act(() => void window.dispatchEvent(new Event(on ? 'online' : 'offline')));
};

afterEach(() => vi.restoreAllMocks());

describe('offline', () => {
  it('the student app shows one offline screen, and comes back by itself', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await renderAt('/s', { workspace: null });
    expect(await screen.findByRole('heading', { name: tr('offline.title') })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(tr('offline.body'));
    expect(screen.queryByRole('link', { name: tr('scan.open') })).toBeNull();
    // "Try again" while still offline keeps the screen.
    fireEvent.click(screen.getByRole('button', { name: tr('offline.retry') }));
    expect(screen.getByRole('heading', { name: tr('offline.title') })).toBeVisible();
    setOnline(true);
    expect(screen.queryByRole('heading', { name: tr('offline.title') })).toBeNull();
    expect(await screen.findByRole('link', { name: tr('scan.open') })).toBeVisible();
  });

  it('staff screens keep their page with a banner on top', async () => {
    await renderAt('/');
    expect(screen.queryByText(tr('offline.banner'))).toBeNull();
    setOnline(false);
    expect(await screen.findByText(tr('offline.banner'))).toBeVisible();
    setOnline(true);
    expect(screen.queryByText(tr('offline.banner'))).toBeNull();
  });
});
