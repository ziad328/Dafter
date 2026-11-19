import { DEFAULT_TEMPLATES, TEMPLATE_PLACEHOLDERS } from '@dafter/contracts';
import type {
  AttendanceRecord,
  Exam,
  ExamSheet,
  MyAttendanceRecord,
  MyGrade,
  TrendStats,
  MySession,
  OpenSession,
} from '@dafter/contracts';
import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import captured from './fixtures.json';

/**
 * Fixtures captured from the dev API (owner of «سنتر النور»), plus the few the owner can't read
 * (the student app, live records). Tests copy and change them; they never edit these.
 */
const open = captured.sessions.find((s) => s.status === 'open')!;
const [first, second] = captured.roster;
const record = (studentId: string, status: AttendanceRecord['status']): AttendanceRecord => ({
  id: crypto.randomUUID(),
  studentId,
  nameAr: captured.roster.find((r) => r.studentId === studentId)!.nameAr,
  nameEn: null,
  status,
  method: 'manual',
  recordedAt: new Date().toISOString(),
});
const mySession = (startsInMin: number, status: MySession['status'] = 'scheduled'): MySession => ({
  id: crypto.randomUUID(),
  center: { nameAr: 'سنتر النور', nameEn: 'Al-Nour Center' },
  subject: captured.subjects[0]!,
  gradeLevel: captured.gradeLevels[0]!,
  groupLabel: startsInMin === 30 ? 'مجموعة أ' : null,
  teacherName: 'أحمد محمود',
  startsAt: new Date(Date.now() + startsInMin * 60_000).toISOString(),
  endsAt: new Date(Date.now() + (startsInMin + 90) * 60_000).toISOString(),
  status,
  timezone: 'Africa/Cairo',
});

const exam: Exam = {
  id: '7d0c3a52-6f2e-4b8e-9a4f-1c2d3e4f5a6b',
  groupId: captured.group.id,
  title: 'امتحان الشهر',
  heldOn: '2026-11-21',
  maxScore: 20,
  graded: 1,
  absent: 1,
  average: 18,
  notifiedAt: null,
};
const examSheet: ExamSheet = {
  exam,
  subject: captured.group.subject,
  groupLabel: null,
  rows: [
    { studentId: first!.studentId, nameAr: first!.nameAr, nameEn: null, score: 18, absent: false },
    {
      studentId: second!.studentId,
      nameAr: second!.nameAr,
      nameEn: null,
      score: null,
      absent: true,
    },
    {
      studentId: '3c1f7e2a-9b8d-4c6e-8f1a-2b3c4d5e6f70',
      nameAr: 'عمر خالد',
      nameEn: 'Omar',
      score: null,
      absent: false,
    },
  ],
};
const myGrades: MyGrade[] = [
  { score: 18, absent: false },
  { score: null, absent: true },
].map((g, i) => ({
  examId: crypto.randomUUID(),
  center: { nameAr: 'سنتر النور', nameEn: null },
  subject: captured.subjects[0]!,
  title: `امتحان ${i + 1}`,
  heldOn: `2026-11-${21 - i * 7}`,
  maxScore: 20,
  ...g,
}));

const weeks = Array.from(
  { length: 8 },
  (_, i) =>
    `2026-${i < 4 ? '10' : '11'}-${String(i < 4 ? 3 + i * 7 : (i - 4) * 7 + 1 + 6).padStart(2, '0')}`,
);
const trends: TrendStats = {
  weeks,
  groups: [
    {
      id: captured.group.id,
      subject: captured.group.subject,
      gradeLevel: captured.group.gradeLevel,
      label: 'مجموعة أ',
      teacherName: 'منى حسن',
      attendance: weeks.map((_, i) =>
        i < 6 ? { present: 0, total: 0 } : { present: 9, total: 10 },
      ),
      exams: [
        { id: crypto.randomUUID(), title: 'امتحان', heldOn: '2026-11-07', averagePct: null },
        { id: crypto.randomUUID(), title: 'شهر', heldOn: '2026-11-14', averagePct: 82.5 },
      ],
    },
  ],
  money: ['06', '07', '08', '09', '10', '11'].map((m, i) => ({
    month: `2026-${m}`,
    cash: i * 10000,
    vodafone_cash: 0,
    instapay: 0,
    total: i * 10000,
  })),
};

export const fx = {
  ...captured,
  trends,
  exam,
  examSheet,
  myGrades,
  openSession: {
    sessionId: open.id,
    qrKey: 'dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXk',
    serverTime: new Date().toISOString(),
    windowMs: 10_000,
  } satisfies OpenSession,
  record,
  liveRecords: [record(first!.studentId, 'present')],
  closeRecords: [record(first!.studentId, 'present'), record(second!.studentId, 'absent')],
  mySchedule: [mySession(30), mySession(60 * 24, 'cancelled'), mySession(60 * 48)],
  myAttendance: [
    { status: 'present' },
    { status: 'late' },
    { status: 'excused' },
    { status: 'absent' },
  ].map((r, i): MyAttendanceRecord => ({
    sessionId: crypto.randomUUID(),
    center: { nameAr: 'سنتر النور', nameEn: null },
    subject: captured.subjects[0]!,
    startsAt: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(),
    timezone: 'Africa/Cairo',
    status: r.status as MyAttendanceRecord['status'],
  })),
};

/** Every request the app sent in this test, newest last: "METHOD /path?query" and its body. */
export const sent: { call: string; body: unknown }[] = [];

const ok = (body: JsonBodyType, status = 200) => HttpResponse.json(body, { status });
const api = (path: string) => `*/api/v1/${path}`;
const log =
  (
    body:
      | JsonBodyType
      | ((req: Request, params: Record<string, unknown>) => JsonBodyType | Promise<JsonBodyType>),
    status = 200,
  ) =>
  async ({ request, params }: { request: Request; params: Record<string, unknown> }) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.clone().text();
    sent.push({
      call: `${request.method} ${url.pathname}${url.search}`,
      body: text ? JSON.parse(text) : undefined,
    });
    if (status === 204) return new HttpResponse(null, { status });
    return ok(typeof body === 'function' ? await body(request, params) : body, status);
  };

export const handlers = [
  http.get('*/health', log({ status: 'ok' })),
  http.post(api('auth/refresh'), log(fx.auth)),
  http.post(api('auth/login'), log(fx.auth)),
  http.post(api('auth/register'), log(fx.auth, 201)),
  http.post(api('auth/logout'), log(null, 204)),
  http.post(api('auth/password-reset'), log(null, 204)),
  http.post(api('auth/password-reset/confirm'), log(null, 204)),
  http.post(api('auth/otp/request'), log(null, 204)),
  http.post(api('auth/otp/verify'), log(fx.auth)),
  http.get(api('me'), log(fx.me)),
  http.get(api('me/schedule'), log(fx.mySchedule)),
  http.get(api('me/attendance'), log(fx.myAttendance)),
  http.get(api('me/grades'), log(fx.myGrades)),
  http.post(
    api('devices/bind'),
    log({ id: crypto.randomUUID(), boundAt: new Date().toISOString() }, 201),
  ),
  http.post(
    api('check-ins'),
    log(
      {
        id: crypto.randomUUID(),
        sessionId: open.id,
        status: 'present',
        recordedAt: new Date().toISOString(),
      },
      201,
    ),
  ),
  http.get(api('workspaces'), log(fx.workspaces)),
  http.post(api('workspaces'), log(fx.workspaces[0]!, 201)),
  http.get(api('workspaces/current'), log(fx.currentWorkspace)),
  http.post(
    api('invites'),
    log(
      {
        id: crypto.randomUUID(),
        token: 'staff-invite-token',
        role: 'assistant',
        expiresAt: new Date().toISOString(),
        teacherMembershipIds: [],
      },
      201,
    ),
  ),
  http.post(api('invites/:token/accept'), log(fx.currentWorkspace)),
  http.get(
    api('invites'),
    log([
      {
        id: '0d3b1c55-7a39-4c43-9a43-8f1f1b0e2c11',
        role: 'assistant',
        expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
        createdAt: new Date().toISOString(),
        invitedBy: 'منى حسن',
      },
    ]),
  ),
  http.delete(api('invites/:id'), log(null, 204)),
  http.get(
    api('invites/:token'),
    log({
      workspaceNameAr: 'سنتر النور',
      workspaceNameEn: 'Al-Nour Center',
      workspaceType: 'center',
      role: 'assistant',
    }),
  ),
  http.get(
    api('student-invites/:token'),
    log({
      studentFirstNameAr: 'سارة',
      studentFirstNameEn: null,
      workspaceNameAr: 'سنتر النور',
      workspaceNameEn: 'Al-Nour Center',
    }),
  ),
  http.get(api('members'), log(fx.members)),
  http.post(
    api('members/:id/password-reset'),
    log({ token: 'staff-reset-token', expiresAt: new Date().toISOString() }, 201),
  ),
  http.patch(
    api('members/:id'),
    log(async (r, p) => ({
      ...fx.members.find((m) => m.id === p.id)!,
      ...((await r.clone().json()) as object),
    })),
  ),
  http.put(
    api('members/:id/scopes'),
    log((_r, p) => fx.members.find((m) => m.id === p.id)!),
  ),
  // Captured before curriculum items had a status: every one is active.
  http.get(api('subjects'), log(fx.subjects.map((s) => ({ ...s, status: 'active' })))),
  http.get(api('grade-levels'), log(fx.gradeLevels.map((g) => ({ ...g, status: 'active' })))),
  ...(['subjects', 'grade-levels'] as const).flatMap((path) => [
    // The new order back, as ids only: the screen refetches the list anyway.
    http.put(
      api(`${path}/order`),
      log(async (req) => ((await req.json()) as { ids: string[] }).ids.map((id) => ({ id }))),
    ),
    http.post(
      api(path),
      log(async (req) => {
        const body = (await req.json()) as { nameAr: string; nameEn?: string };
        return { id: crypto.randomUUID(), nameEn: body.nameAr, status: 'active', ...body };
      }, 201),
    ),
    http.patch(
      api(`${path}/:id`),
      log(async (req, params) => ({
        id: params.id,
        nameAr: 'مادة',
        nameEn: 'Subject',
        status: 'active',
        ...((await req.json()) as object),
      })),
    ),
  ]),
  // The default wording for every trigger, no custom text.
  http.get(
    api('message-templates'),
    log(
      Object.entries(TEMPLATE_PLACEHOLDERS).map(([trigger, placeholders]) => ({
        trigger,
        placeholders,
        ar: { default: DEFAULT_TEMPLATES[trigger as 'absence'].ar, custom: null },
        en: { default: DEFAULT_TEMPLATES[trigger as 'absence'].en, custom: null },
      })),
    ),
  ),
  http.put(
    api('message-templates/:trigger'),
    log(async (req, params) => {
      const body = (await req.json()) as { ar: string | null; en: string | null };
      const trigger = params.trigger as 'absence';
      return {
        trigger,
        placeholders: TEMPLATE_PLACEHOLDERS[trigger],
        ar: { default: DEFAULT_TEMPLATES[trigger].ar, custom: body.ar },
        en: { default: DEFAULT_TEMPLATES[trigger].en, custom: body.en },
      };
    }),
  ),
  http.get(api('attendance-settings'), log({ lateAfterMinutes: 15 })),
  http.put(
    api('attendance-settings'),
    log(async (req) => (await req.json()) as object),
  ),
  // No rooms by default (most centers start without); rooms.spec.tsx adds them.
  http.get(api('rooms'), log([])),
  http.post(
    api('rooms'),
    log(
      async (req) => ({
        id: crypto.randomUUID(),
        capacity: null,
        status: 'active',
        ...((await req.json()) as object),
      }),
      201,
    ),
  ),
  http.patch(
    api('rooms/:id'),
    log(async (req, params) => ({
      id: params.id,
      name: 'قاعة',
      capacity: null,
      status: 'active',
      ...((await req.json()) as object),
    })),
  ),
  http.get(api('groups'), log(fx.groups)),
  http.post(api('groups'), log(fx.group, 201)),
  http.get(api('groups/:id'), log(fx.group)),
  http.patch(api('groups/:id'), log(fx.group)),
  http.get(api('sessions'), log(fx.sessions)),
  http.patch(api('sessions/:id'), log(fx.sessions[1]!)),
  http.post(api('sessions/:id/cancel'), log({ ...fx.sessions[1]!, status: 'cancelled' })),
  http.post(api('sessions/:id/open'), log(fx.openSession)),
  http.get(api('sessions/:id/attendance'), log(fx.liveRecords)),
  http.get(api('sessions/:id/roster'), log(fx.roster)),
  http.put(
    api('sessions/:id/attendance/:studentId'),
    log(async (req, p) =>
      record(
        p.studentId as string,
        ((await req.clone().json()) as { status: AttendanceRecord['status'] }).status,
      ),
    ),
  ),
  http.post(api('sessions/:id/close'), log({ records: fx.closeRecords, messagesQueued: 3 })),
  http.get(api('sessions/:id/live'), async () => {
    await delay('infinite');
    return new HttpResponse(null);
  }),
  http.get(api('stats/today'), log(fx.stats)),
  http.get(api('stats/trends'), log(fx.trends)),
  http.get(
    api('stats/owing'),
    log(
      fx.students
        .filter((s) => s.balancePiastres > 0)
        .map(({ id, nameAr, nameEn, gradeLevel, balancePiastres }) => ({
          id,
          nameAr,
          nameEn,
          gradeLevel,
          balancePiastres,
        })),
    ),
  ),
  http.get(
    api('stats/collections'),
    log({
      today: { cash: 30000, vodafone_cash: 15050, instapay: 0, total: 45050 },
      month: { cash: 120000, vodafone_cash: 15050, instapay: 50000, total: 185050 },
    }),
  ),
  http.get(
    api('stats/cash-summary'),
    log((req) => ({
      date: new URL(req.url).searchParams.get('date') ?? '2026-11-21',
      timezone: 'Africa/Cairo',
      center: { nameAr: 'سنتر النور', nameEn: 'Al Nour Center' },
      staff: [
        {
          userId: '00000000-0000-4000-8000-0000000000a1',
          name: 'منى',
          totals: { cash: 30000, vodafone_cash: 15050, instapay: -5000, total: 40050 },
          entries: [
            {
              id: '00000000-0000-4000-8000-0000000000e1',
              kind: 'payment',
              receiptNo: 12,
              studentName: 'أحمد علي',
              amountPiastres: 30000,
              method: 'cash',
              createdAt: '2026-11-21T08:00:00.000Z',
            },
            {
              id: '00000000-0000-4000-8000-0000000000e2',
              kind: 'payment',
              receiptNo: 13,
              studentName: 'سارة محمد',
              amountPiastres: 15050,
              method: 'vodafone_cash',
              createdAt: '2026-11-21T09:00:00.000Z',
            },
            {
              id: '00000000-0000-4000-8000-0000000000e3',
              kind: 'reversal',
              receiptNo: 9,
              studentName: 'أحمد علي',
              amountPiastres: -5000,
              method: 'instapay',
              createdAt: '2026-11-21T10:00:00.000Z',
            },
          ],
        },
        {
          userId: '00000000-0000-4000-8000-0000000000a2',
          name: 'كريم',
          totals: { cash: 0, vodafone_cash: 0, instapay: 0, total: 0 },
          entries: [],
        },
      ],
    })),
  ),
  http.get(api('students'), log(fx.students)),
  http.post(api('students'), log(fx.student, 201)),
  http.get(api('students/:id'), log(fx.student)),
  http.patch(api('students/:id'), log(fx.student)),
  http.get(api('students/:id/enrollments'), log(fx.enrollments)),
  http.post(api('students/:id/enrollments'), log(fx.enrollments[0]!, 201)),
  http.delete(
    api('students/:id/enrollments/:enrollmentId'),
    log({ ...fx.enrollments[0]!, status: 'left' }),
  ),
  http.post(
    api('students/:id/invite'),
    log({ token: 'student-invite-token', expiresAt: new Date().toISOString() }, 201),
  ),
  http.delete(api('students/:id/device'), log(null, 204)),
  http.get(api('students/:id/ledger'), log(fx.ledger)),
  http.post(
    api('payments'),
    log(
      fx.ledger.entries.find((e) => e.type === 'payment')!,
      201,
    ),
  ),
  http.post(api('ledger/:id/reverse'), log(fx.ledger.entries[0]!, 201)),
  http.get(api('ledger/:id/receipt'), log(fx.receipt)),
  http.get(api('messages'), log(fx.messages)),
  http.get(api('message-settings'), log(fx.messageSettings)),
  http.put(
    api('message-settings'),
    log(async (req) => (await req.clone().json()) as JsonBodyType),
  ),
  http.get(api('dev/phone'), log(fx.phone)),
  http.get(
    api('groups/:id/exams'),
    log([
      fx.exam,
      {
        ...fx.exam,
        id: crypto.randomUUID(),
        title: 'امتحان قديم',
        heldOn: '2026-11-07',
        graded: 0,
        absent: 0,
        average: null,
      },
    ]),
  ),
  http.post(api('groups/:id/exams'), log(fx.exam, 201)),
  http.get(api('exams/:id'), log(fx.examSheet)),
  http.patch(api('exams/:id'), log(fx.exam)),
  http.delete(api('exams/:id'), log(null, 204)),
  http.put(api('exams/:id/results'), log(fx.examSheet)),
  http.post(api('exams/:id/notify'), log({ queued: 2 })),
];

export const server = setupServer(...handlers);

/** An API error the way the server sends it: a code, never a sentence (rule 3). */
export const fail =
  (code: string, status = 400) =>
  async () =>
    ok({ code }, status);

export { http };
export const route = api;
