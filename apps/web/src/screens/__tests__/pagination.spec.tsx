import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fail, fx, http, route, server } from '@/test/server';
import { renderAt, tr } from '@/test/render';

const many = <T extends { id: string }>(base: T, n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => ({
    ...base,
    id: `00000000-0000-4000-8000-${tag}${String(i).padStart(12 - tag.length, '0')}`,
  }));

describe('show more', () => {
  it('pages the student list by the last id until a page is not full', async () => {
    const first = many(fx.students[0]!, 50, 'a').map((s, i) => ({ ...s, nameAr: `طالب ${i}` }));
    const second = many(fx.students[0]!, 50, 'b').map((s, i) => ({ ...s, nameAr: `تالي ${i}` }));
    const third = many(fx.students[0]!, 1, 'c').map((s) => ({ ...s, nameAr: 'الأخير' }));
    server.use(
      http.get(route('students'), ({ request }) => {
        const after = new URL(request.url).searchParams.get('after');
        if (after === first.at(-1)!.id) return Response.json(second);
        if (after === second.at(-1)!.id) return Response.json(third);
        return Response.json(first);
      }),
    );
    const { user } = await renderAt('/students');
    expect(await screen.findByText('طالب 49')).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('list.more') }));
    expect(await screen.findByText('تالي 0')).toBeVisible();
    await user.click(screen.getByRole('button', { name: tr('list.more') }));
    expect(await screen.findByText('الأخير')).toBeVisible();
    // The last page wasn't full: nothing more.
    expect(screen.queryByRole('button', { name: tr('list.more') })).toBeNull();
  });

  it('pages the message log, and shows a failed page', async () => {
    const first = many(fx.messages[0]!, 100, 'd');
    const second = many(fx.messages[0]!, 100, 'e').map((m) => ({ ...m, students: ['التالي'] }));
    server.use(
      http.get(route('messages'), ({ request }) => {
        const after = new URL(request.url).searchParams.get('after');
        if (!after) return Response.json(first);
        return after === first.at(-1)!.id ? Response.json(second) : fail('INTERNAL', 500)();
      }),
    );
    const { user } = await renderAt('/messages');
    await screen.findByTestId('message-log');
    await user.click(screen.getByRole('button', { name: tr('list.more') }));
    expect((await screen.findAllByText('التالي')).length).toBe(100);
    await user.click(screen.getByRole('button', { name: tr('list.more') }));
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
