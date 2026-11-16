import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/i18n';
import { FilterPicker } from './FilterChips';

const options = Array.from({ length: 10 }, (_, i) => ({ value: `g${i}`, label: `مجموعة ${i}` }));
options[3] = { value: 'g3', label: 'الفيزياء · السبت' };

function Picker() {
  const [value, setValue] = useState('');
  return <FilterPicker label="المجموعة" options={options} value={value} onChange={setValue} />;
}

describe('filter picker', () => {
  it('searches a long list with Arabic normalized, picks, and names the choice', async () => {
    await i18n.changeLanguage('ar');
    const user = userEvent.setup();
    render(<Picker />);
    await user.click(screen.getByRole('button', { name: 'المجموعة' }));
    const list = screen.getByRole('group', { name: 'المجموعة' });
    // Part of a word, without «ال», finds «الفيزياء».
    await user.type(screen.getByRole('searchbox'), 'فيزيا');
    expect(within(list).getAllByRole('button')).toHaveLength(2); // «الكل» + the match
    await user.click(within(list).getByRole('button', { name: 'الفيزياء · السبت' }));
    expect(screen.getByRole('button', { name: 'المجموعة: الفيزياء · السبت' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });
});
