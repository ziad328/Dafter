import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Page';

const initials = (name: string) => render(<Avatar name={name} />).container.textContent;

describe('avatar', () => {
  it('skips the Arabic article when picking initials', () => {
    expect(initials('سنتر النور')).toBe('سن');
    expect(initials('أحمد محمود')).toBe('أم');
    expect(initials('الي')).toBe('ا');
    expect(initials('Al-Nour Center')).toBe('AC');
  });
});
