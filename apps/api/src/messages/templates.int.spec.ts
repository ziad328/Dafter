import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES } from '@dafter/contracts';
import { useTestDb } from '@dafter/db/testing';
import { createApp } from '../app.js';
import { FakeClock } from '../clock.js';
import { sendDueMessages } from '../jobs/send-outbox.js';
import { ConsoleMailer } from '../student-auth/mailer.js';
import { fixtures } from '../testing/fixtures.js';
import { MessageProvider } from './provider.js';

const testDb = useTestDb();
// Saturday 15:00 Cairo, outside quiet hours; the fixture group meets Saturdays at 16:00.
const clock = new FakeClock(new Date('2026-11-21T13:00:00Z'));
const mailer = new ConsoleMailer();
let app: NestFastifyApplication;
const f = fixtures(
  () => app,
  () => testDb().db,
  mailer,
);

class Phone extends MessageProvider {
  sent: { phone: string; body: string }[] = [];
  async send(phone: string, body: string) {
    this.sent.push({ phone, body });
    return `test-${this.sent.length}`;
  }
}

beforeAll(async () => {
  app = await createApp({ logger: false, db: testDb().db, clock, mailer });
  await app.init();
});
afterAll(() => app.close());

describe('message templates', () => {
  it('lists every trigger with its placeholders; owner and assistant only', async () => {
    const c = await f.center();
    const res = await c.assistant('GET', 'message-templates');
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.map((t: { trigger: string }) => t.trigger)).toEqual([
      'absence',
      'session_cancelled',
      'session_moved',
      'exam_result',
      'fee_overdue',
    ]);
    expect(list[0]).toEqual({
      trigger: 'absence',
      placeholders: ['center', 'students', 'subject', 'time', 'wasWere'],
      ar: { default: DEFAULT_TEMPLATES.absence.ar, custom: null },
      en: { default: DEFAULT_TEMPLATES.absence.en, custom: null },
    });
    expect((await c.teacher('GET', 'message-templates')).json().code).toBe('FORBIDDEN');
  });

  it('only the owner saves; unknown placeholders are refused; empty means the default', async () => {
    const c = await f.center();
    for (const call of [c.teacher, c.assistant]) {
      const res = await call('PUT', 'message-templates/absence', { ar: 'نص', en: null });
      expect(res.json().code).toBe('FORBIDDEN');
    }
    const bad = await c.owner('PUT', 'message-templates/session_cancelled', {
      ar: 'ألغيت حصة {subject}',
      en: '{students} cancelled',
    });
    expect([bad.statusCode, bad.json().code, bad.json().details]).toEqual([
      400,
      'TEMPLATE_PLACEHOLDER_UNKNOWN',
      { placeholder: 'students', locale: 'en' },
    ]);
    const spaced = await c.owner('PUT', 'message-templates/absence', {
      ar: 'غياب { students }',
      en: null,
    });
    expect(spaced.json().details).toEqual({ placeholder: ' students ', locale: 'ar' });
    // The default text, even with extra spaces, is stored as "no custom wording".
    const same = await c.owner('PUT', 'message-templates/session_moved', {
      ar: ` ${DEFAULT_TEMPLATES.session_moved.ar} `,
      en: DEFAULT_TEMPLATES.session_moved.en,
    });
    expect(same.json()).toMatchObject({ ar: { custom: null }, en: { custom: null } });
    const trigger = await c.owner('PUT', 'message-templates/nope', { ar: null, en: null });
    expect(trigger.json().code).toBe('VALIDATION_FAILED');

    const saved = await c.owner('PUT', 'message-templates/absence', {
      ar: '  {center}: {students} غاب اليوم ',
      en: '',
    });
    expect(saved.json()).toMatchObject({
      ar: { custom: '{center}: {students} غاب اليوم' },
      en: { custom: null, default: DEFAULT_TEMPLATES.absence.en },
    });
    // Saving another trigger keeps this one, and the message switches stay as they were.
    await c.owner('PUT', 'message-templates/fee_overdue', { ar: null, en: 'Pay {due}' });
    const list = (await c.owner('GET', 'message-templates')).json();
    expect(list[0].ar.custom).toBe('{center}: {students} غاب اليوم');
    expect(list[4].en.custom).toBe('Pay {due}');
    expect((await c.owner('GET', 'message-settings')).json()).toMatchObject({ absence: true });

    // Another center keeps the defaults.
    const other = await f.center();
    expect((await other.owner('GET', 'message-templates')).json()[0].ar.custom).toBeNull();
  });

  it("sends the center's wording, also for messages queued before the edit, and resets", async () => {
    const c = await f.center();
    const phone = new Phone();
    const enroll = async (guardian: string) => {
      const id = await c.newStudent({ phone: guardian });
      await c.owner('POST', `students/${id}/enrollments`, { groupId: c.groupId });
    };
    await enroll('01292000001');
    await enroll('01292000002');
    const sessions = (await c.owner('GET', 'sessions?from=2026-11-28&to=2026-12-05')).json();

    // Queued with the default wording in place, then the owner edits it before it is sent.
    await c.teacher('POST', `sessions/${sessions[0].id}/cancel`);
    await c.owner('PUT', 'message-templates/session_cancelled', {
      ar: 'إلغاء: {subject} يوم {time} — {center}',
      en: null,
    });
    await sendDueMessages(testDb().db, clock, phone, c.workspaceId);
    expect(phone.sent).toHaveLength(2);
    for (const m of phone.sent) {
      expect(m.body).toMatch(/^إلغاء: .+ يوم .+ — سنتر$/);
      expect(m.body).not.toContain('{');
    }

    // Back to the default.
    await c.owner('PUT', 'message-templates/session_cancelled', { ar: null, en: null });
    await c.teacher('POST', `sessions/${sessions[1].id}/cancel`);
    await sendDueMessages(testDb().db, clock, phone, c.workspaceId);
    expect(phone.sent.slice(2).map((m) => m.body)).toEqual([
      expect.stringMatching(/^سنتر: تم إلغاء حصة /),
      expect.stringMatching(/^سنتر: تم إلغاء حصة /),
    ]);
  });
});
