import {
  choose,
  enterWorkspace,
  expect,
  freshCenter,
  openNav,
  signIn,
  STAFF,
  test,
  workspaceChip,
} from './fixtures';

const MONA = { ar: 'دروس منى حسن', en: 'Mona Hassan Lessons' };

test('a cancelled session shows in the message log; the owner switches messages off and on', async ({
  page,
  request,
  lang,
  t,
}) => {
  // Data through the API as the center owner: a group meeting tomorrow, one enrolled student.
  const c = await freshCenter(request, 'سنتر الرسائل', ['teacher']);
  const { get, post } = c.api;

  const tomorrow = new Date(
    Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())) +
      86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const [subject] = await get('subjects');
  const [grade] = await get('grade-levels');
  const group = await post('groups', {
    subjectId: subject.id,
    gradeLevelId: grade.id,
    slots: [
      {
        weekday: new Date(`${tomorrow}T12:00:00Z`).getUTCDay(),
        startTime: '10:00',
        endTime: '11:00',
      },
    ],
  });
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const name = `سلمى ${n}`;
  const student = await post('students', {
    nameAr: name,
    gradeLevelId: grade.id,
    guardian: { phone: `011${n}`, relation: 'father', preferredLocale: lang, whatsappOptIn: false },
  });
  await post(`students/${student.id}/enrollments`, { groupId: group.id });
  const sessions = (await get(`sessions?from=${tomorrow}&to=${tomorrow}`)) as {
    id: string;
    groupId: string;
  }[];
  await post(`sessions/${sessions.find((s) => s.groupId === group.id)!.id}/cancel`);

  // The owner's log, reached from Home.
  await signIn(page, t, STAFF.owner);
  await enterWorkspace(page, t, c.name);
  await openNav(page, t, t.nav.messages);
  const item = page.getByTestId('message-log').getByRole('listitem').filter({ hasText: name });
  await expect(item).toContainText(t.messages.triggers.session_cancelled);
  await expect(item).toContainText(`011${n}`);

  // Switches: once (ar), in the teacher's own workspace, so parallel tests keep their messages.
  if (lang !== 'ar') return;
  await page.context().clearCookies(); // signs out: the refresh cookie is gone
  await signIn(page, t, STAFF.teacher);
  await expect(workspaceChip(page, t)).toBeVisible();
  await page.goto('/workspaces');
  await page.getByRole('button', { name: MONA[lang] }).click();
  await page.goto('/messages/settings');
  const toggle = page.getByLabel(t.messages.toggles.sessionChange);
  await toggle.check(); // on by default; a failed earlier run may have left it off
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();

  // Fee reminders are a money text: they wait until the owner turns them on.
  const fees = page.getByLabel(t.messages.toggles.feeOverdue);
  await fees.uncheck(); // off by default; a failed earlier run may have left it on
  await fees.check();
  await page.reload();
  await expect(fees).toBeChecked();
  await fees.uncheck();
  await expect(fees).not.toBeChecked();

  // The center picks the day reminders start (the 7th by default).
  const day = page.getByRole('combobox', { name: t.messages.feeReminderFromDay });
  const pick = async (value: string) => {
    if ((await day.textContent())?.trim() === value) return;
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/message-settings') && r.request().method() === 'PUT',
    );
    await choose(page, t.messages.feeReminderFromDay, { index: Number(value) - 1 });
    await saved;
  };
  await pick('7'); // a failed earlier run may have left another day
  await pick('3');
  await page.reload();
  await expect(day).toHaveText('3');
  await pick('7');
  await expect(day).toHaveText('7');
});
