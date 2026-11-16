import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HIDE_MS, PageScrollbar } from './PageScrollbar';

const page = (scrollHeight: number, clientHeight: number) => {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
};

afterEach(() => vi.useRealTimers());

describe('page scrollbar', () => {
  it('floats a thumb while the page scrolls, then hides it', () => {
    vi.useFakeTimers();
    page(2000, 500);
    const { unmount } = render(<PageScrollbar />);
    const bar = screen.getByTestId('page-scrollbar');
    const thumb = bar.firstElementChild as HTMLElement;
    expect(bar.dataset.shown).toBe('false');
    expect(thumb).toHaveClass('opacity-0');

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(bar.dataset.shown).toBe('true');
    expect(thumb).toHaveClass('opacity-100');
    expect(thumb.style.top).toBe('25%');
    expect(thumb.style.height).toBe('25%');

    act(() => vi.advanceTimersByTime(HIDE_MS));
    expect(bar.dataset.shown).toBe('false');
    unmount();
  });

  it('stays hidden on a page that fits the screen', () => {
    page(500, 500);
    render(<PageScrollbar />);
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(screen.getByTestId('page-scrollbar').firstElementChild).toHaveClass('opacity-0');
  });
});
