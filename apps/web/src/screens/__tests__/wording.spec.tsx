import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fail, http, route, sent, server } from '@/test/server';
import { renderAt, tr } from '@/test/render';

const body = (c: string) => sent.findLast((s) => s.call === c)?.body;

/** Opens one trigger's card on /messages/settings. */
async function openCard(trigger: string) {
  const summary = await screen.findByText(tr(`messages.triggers.${trigger}`), {
    selector: 'summary',
  });
  fireEvent.click(summary);
  return summary.closest('details')!;
}

describe('message wording', () => {
  it('the owner edits a text with a live preview, inserts a part, and saves', async () => {
    const { user } = await renderAt('/messages/settings');
    expect(
      await screen.findByRole('heading', { name: tr('messages.wording.title') }),
    ).toBeVisible();
    const card = await openCard('session_cancelled');
    const ar = within(card).getByLabelText(tr('messages.wording.language.ar'));
    const preview = within(card).getByTestId('preview-session_cancelled-ar');
    // The default, filled with Arabic samples.
    expect(preview).toHaveTextContent('سنتر النور: تم إلغاء حصة الفيزياء');

    await user.clear(ar);
    await user.type(ar, 'اتلغت حصة ');
    const [chips] = within(card).getAllByRole('group', { name: tr('messages.wording.insert') });
    await user.click(
      within(chips!).getByRole('button', { name: tr('messages.placeholders.subject') }),
    );
    expect(ar).toHaveValue('اتلغت حصة {subject}');
    expect(preview).toHaveTextContent('اتلغت حصة الفيزياء');

    await user.click(within(card).getByRole('button', { name: tr('messages.wording.save') }));
    await expect
      .poll(() => body('PUT /api/v1/message-templates/session_cancelled'))
      .toEqual({ ar: 'اتلغت حصة {subject}', en: null });
    expect(await within(card).findByRole('status')).toHaveTextContent(tr('messages.wording.saved'));
    // Typing again hides "Saved" until the next save.
    await user.type(ar, '!');
    expect(within(card).queryByRole('status')).toBeNull();

    // Back to the default sends nulls, and the box shows the default again.
    await user.click(within(card).getByRole('button', { name: tr('messages.wording.reset') }));
    await expect
      .poll(() => body('PUT /api/v1/message-templates/session_cancelled'))
      .toEqual({ ar: null, en: null });
    expect(ar).toHaveValue('{center}: تم إلغاء حصة {subject} ({time}).');
  });

  it('refuses a part the message does not offer, and shows "was/were" only in English', async () => {
    const { user } = await renderAt('/messages/settings', { lang: 'en' });
    const card = await openCard('absence');
    const groups = within(card).getAllByRole('group', { name: tr('messages.wording.insert') });
    const wasWere = tr('messages.placeholders.wasWere');
    expect(within(groups[0]!).queryByRole('button', { name: wasWere })).toBeNull();
    expect(within(groups[1]!).getByRole('button', { name: wasWere })).toBeVisible();
    expect(within(card).getByTestId('preview-absence-en')).toHaveTextContent(
      'Al-Nour Center: Ahmed and Mariam were absent from Physics',
    );

    const en = within(card).getByLabelText(tr('messages.wording.language.en'));
    fireEvent.change(en, { target: { value: '{students} {month}' } });
    await user.click(within(card).getByRole('button', { name: tr('messages.wording.save') }));
    expect(
      within(card).getByText(
        tr('messages.wording.unknown', {
          placeholder: '{month}',
          language: tr('messages.wording.language.en'),
        }),
      ),
    ).toBeVisible();
    expect(body('PUT /api/v1/message-templates/absence')).toBeUndefined();

    // An emptied box previews the default.
    fireEvent.change(en, { target: { value: '  ' } });
    expect(within(card).getByTestId('preview-absence-en')).toHaveTextContent(/were absent/);
  });

  it('marks custom wording, and shows a failed save', async () => {
    server.use(
      http.get(route('message-templates'), () =>
        Response.json([
          {
            trigger: 'fee_overdue',
            placeholders: ['center', 'month', 'due'],
            ar: { default: 'افتراضي {due}', custom: 'ادفع {due}' },
            en: { default: 'Default {due}', custom: null },
          },
        ]),
      ),
      http.put(route('message-templates/:trigger'), fail('TEMPLATE_PLACEHOLDER_UNKNOWN', 400)),
    );
    const { user } = await renderAt('/messages/settings');
    const card = await openCard('fee_overdue');
    expect(within(card).getByText(tr('messages.wording.custom'))).toBeVisible();
    expect(within(card).getByLabelText(tr('messages.wording.language.ar'))).toHaveValue(
      'ادفع {due}',
    );
    await user.click(within(card).getByRole('button', { name: tr('messages.wording.save') }));
    expect(await within(card).findByRole('alert')).toHaveTextContent(
      tr('errors.TEMPLATE_PLACEHOLDER_UNKNOWN'),
    );
  });

  it('shows a failed list', async () => {
    server.use(http.get(route('message-templates'), fail('FORBIDDEN', 403)));
    await renderAt('/messages/settings');
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => a.textContent === tr('errors.FORBIDDEN'))).toBe(true);
  });
});
