import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { type Db, sessions } from '@dafter/db';
import { makeMembership } from '@dafter/db/testing';
import type { ConsoleMailer } from '../student-auth/mailer.js';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Call = (
  method: Method,
  url: string,
  payload?: object,
  headers?: Record<string, string>,
) => ReturnType<NestFastifyApplication['inject']>;

const must = (ok: boolean, what: string) => {
  if (!ok) throw new Error(`fixture: ${what}`);
};

/**
 * Integration-test helpers shared by the student and attendance suites: a center with staff
 * and one group, students, and the invite + OTP activation. Getters, because the app is
 * created in the suite's beforeAll.
 */
export function fixtures(app: () => NestFastifyApplication, db: () => Db, mailer: ConsoleMailer) {
  let n = 0;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const post = (url: string, payload: object, headers: Record<string, string> = {}) =>
    app().inject({ method: 'POST', url: `/api/v1/${url}`, payload, headers });

  async function register(email?: string) {
    const phone = `0173000${String(++n).padStart(4, '0')}`;
    const res = await post('auth/register', {
      name: `مدرس ${n}`,
      phone,
      email,
      password: 'correct horse',
    });
    return { token: res.json().accessToken as string, userId: res.json().user.id as string };
  }

  /** A center with an owner, a teacher (one Saturday 16:00 group) and an unscoped assistant. */
  async function center() {
    const owner = await register();
    const ws = (
      await post('workspaces', { type: 'center', nameAr: 'سنتر' }, bearer(owner.token))
    ).json().id as string;
    const as =
      (token: string): Call =>
      (method, url, payload, headers) =>
        app().inject({
          method,
          url: `/api/v1/${url}`,
          payload,
          headers: { ...bearer(token), 'x-workspace-id': ws, ...headers },
        });
    const member = async (role: 'teacher' | 'assistant') => {
      const u = await register();
      await makeMembership(db(), { workspaceId: ws, userId: u.userId, role });
      return as(u.token);
    };
    const ownerCall = as(owner.token);
    const teacher = await member('teacher');
    // For raw requests (SSE) that cannot go through `inject`.
    const ownerHeaders = { ...bearer(owner.token), 'x-workspace-id': ws };
    const gradeId = (await ownerCall('GET', 'grade-levels')).json()[0].id as string;
    const subjectId = (await ownerCall('GET', 'subjects')).json()[0].id as string;
    const group = (
      await teacher('POST', 'groups', {
        subjectId,
        gradeLevelId: gradeId,
        slots: [{ weekday: 6, startTime: '16:00', endTime: '17:30' }],
      })
    ).json();
    // The same guardian phone links siblings to one guardian.
    const newStudent = async (g: { phone?: string; locale?: 'ar' | 'en' } = {}) =>
      (
        await ownerCall('POST', 'students', {
          nameAr: `طالب ${++n}`,
          gradeLevelId: gradeId,
          guardian: {
            phone: g.phone ?? `0128000${String(n).padStart(4, '0')}`,
            relation: 'mother',
            preferredLocale: g.locale ?? 'ar',
            whatsappOptIn: false,
          },
        })
      ).json().id as string;
    return {
      workspaceId: ws,
      ownerHeaders,
      owner: ownerCall,
      teacher,
      assistant: await member('assistant'),
      groupId: group.id as string,
      newStudent,
    };
  }

  const codeFor = (email: string) => mailer.last(email)!.text.match(/\d{6}/)![0];

  async function newKeyPair() {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey));
    return { pair, publicKey: spki.toString('base64url') };
  }
  const newKey = async () => (await newKeyPair()).publicKey;

  /** Invite + OTP activation; returns the student's access token and refresh cookie. */
  async function activate(call: Call, studentId: string, email: string) {
    const inviteToken = (await call('POST', `students/${studentId}/invite`)).json().token as string;
    const sent = await post('auth/otp/request', { email, inviteToken });
    must(sent.statusCode === 204, `otp request ${sent.statusCode}`);
    const res = await post('auth/otp/verify', { email, code: codeFor(email), inviteToken });
    must(res.statusCode === 200, `otp verify ${res.statusCode}`);
    return {
      token: res.json().accessToken as string,
      userId: res.json().user.id as string,
      rt: res.cookies.find((ck) => ck.name === 'rt')!.value,
      inviteToken,
    };
  }

  /**
   * Opens a session days ahead, straight in the database: the API refuses more than 30 minutes
   * before the start, and these tests are about what happens after opening, not when.
   */
  async function openAhead(sessionId: string) {
    await db().update(sessions).set({ status: 'open' }).where(eq(sessions.id, sessionId));
  }

  return { bearer, post, register, center, codeFor, newKey, newKeyPair, activate, openAhead };
}
