import { expect, PASSWORD, signIn, STAFF, test, openNav, workspaceChip } from './fixtures';

const CENTER = { ar: 'سنتر النور', en: 'Al-Nour Center' };
const MONA = { ar: 'دروس منى حسن', en: 'Mona Hassan Lessons' };

test('a cancelled session shows in the message log; the owner switches messages off and on', async ({
  page,
  request,
  lang,
  t,
}) => {
  // Data through the API as the center owner: a group meeting tomorrow, one enrolled student.
  const login = await request.post('/api/v1/auth/login', {
    data: { login: STAFF.owner, password: PASSWORD },
  });
  const auth = { authorization: `Bearer ${(await login.json()).accessToken}` };
  const workspaces = (await (
    await request.get('/api/v1/workspaces', { headers: auth })
  ).json()) as { id: string; nameAr: string }[];
  const headers = { ...auth, 'x-workspace-id': workspaces.find((w) => w.nameAr === CENTER.ar)!.id };
  const get = async (url: string) => (await request.get(`/api/v1/${url}`, { headers })).json();
  const post = async (url: string, data?: object) =>
    (await request.post(`/api/v1/${url}`, { headers, data })).json();

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
  await page.getByRole('button', { name: CENTER[lang] }).click();
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
  await page.goto('/messages');
  const toggle = page.getByLabel(t.messages.toggles.sessionChange);
  await toggle.check(); // on by default; a failed earlier run may have left it off
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
});
