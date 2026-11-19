import { createPublicKey, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  BindDeviceRequest,
  Device,
  OtpRequest,
  OtpVerifyRequest,
  StudentInvitePreview,
} from '@dafter/contracts';
import { AuthService, type Session } from '../auth/auth.service.js';
import { hashToken } from '../auth/tokens.js';
import { RateLimiter, RateLimitStore } from '../auth/rate-limiter.js';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import { Mailer } from './mailer.js';
import { StudentAuthRepository } from './student-auth.repository.js';

export const OTP_TTL_MS = 10 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

// Salted with the email so one hash table does not crack every code at once.
const otpHash = (email: string, code: string) => hashToken(`${email}:${code}`);
const sameHash = (a: string, b: string) => timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Student login: a 6-digit code by email. First time with an invite token (which names the
 * student record), later with the email alone. Success starts the same session as staff login.
 */
@Injectable()
export class StudentAuthService {
  // Per email: 5 codes per 15 minutes. Per IP: 30, since a whole class may share a center's Wi-Fi.
  private readonly perEmail: RateLimiter;
  private readonly perIp: RateLimiter;
  // Activation-page lookups: 60 per IP per 15 minutes. The token can't be guessed; this only
  // stops a script from hammering the table.
  private readonly previewPerIp: RateLimiter;

  constructor(
    @Inject(StudentAuthRepository) private readonly repo: StudentAuthRepository,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Mailer) private readonly mailer: Mailer,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(RateLimitStore) limits: RateLimitStore,
  ) {
    this.perEmail = new RateLimiter(limits, clock, 'otp-email', 5, WINDOW_MS);
    this.perIp = new RateLimiter(limits, clock, 'otp-ip', 30, WINDOW_MS);
    this.previewPerIp = new RateLimiter(limits, clock, 'invite-preview-ip', 60, WINDOW_MS);
  }

  /** «أهلًا يا سارة — سنتر النور» on the activation page, before any sign-in (audit 3 SA4). */
  async previewInvite(token: string, ip: string): Promise<StudentInvitePreview> {
    await this.previewPerIp.take([ip]);
    const row = await this.repo.findInvitePreview(hashToken(token), this.clock.now());
    if (!row) throw new AppError('INVITE_INVALID');
    const first = (name: string) => name.trim().split(/\s+/)[0]!;
    return {
      studentFirstNameAr: first(row.nameAr),
      studentFirstNameEn: row.nameEn ? first(row.nameEn) : null,
      workspaceNameAr: row.workspaceNameAr,
      workspaceNameEn: row.workspaceNameEn,
    };
  }

  async requestOtp(body: OtpRequest, ip: string) {
    const email = body.email.toLowerCase();
    await this.perEmail.check([email]);
    await this.perIp.check([ip]);
    await Promise.all([this.perEmail.fail([email]), this.perIp.fail([ip])]);
    const now = this.clock.now();
    const user = await this.repo.findUserByEmail(email);
    if (body.inviteToken) {
      if (!(await this.repo.findInvite(hashToken(body.inviteToken), now)))
        throw new AppError('INVITE_INVALID');
      // A staff account (it has a password) cannot become a student login.
      if (user?.passwordHash) throw new AppError('EMAIL_TAKEN');
    } else if (!user || user.passwordHash || !(await this.repo.isStudent(user.id))) {
      return; // Same 204 as a real send, so the response never says whether the email exists.
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.repo.replaceOtp(
      email,
      otpHash(email, code),
      now,
      new Date(now.getTime() + OTP_TTL_MS),
    );
    await this.mailer.send(email, `كود الدخول إلى دفتر: ${code} — Your Dafter code: ${code}`);
  }

  async verifyOtp(body: OtpVerifyRequest): Promise<Session> {
    const email = body.email.toLowerCase();
    const now = this.clock.now();
    const tokenHash = body.inviteToken ? hashToken(body.inviteToken) : undefined;
    const invite = tokenHash ? await this.repo.findInvite(tokenHash, now) : undefined;
    if (tokenHash && !invite) throw new AppError('INVITE_INVALID');
    const expected = otpHash(email, body.code);
    // One transaction: code, invite, user and link all commit together. A wrong code returns
    // (so its attempt is counted) instead of throwing (which would roll the count back).
    const user = await this.repo.transaction(invite?.workspaceId, async (tx) => {
      if (!(await this.repo.checkOtp(tx, email, (h) => sameHash(h, expected), now))) return null;
      if (!invite) return (await this.repo.findUserByEmail(email)) ?? null;
      const u = await this.repo.findOrCreateStudentUser(tx, email, invite.nameAr);
      if (u.passwordHash) throw new AppError('EMAIL_TAKEN');
      if (!(await this.repo.activate(tx, invite.workspaceId, tokenHash!, u.id, now)))
        throw new AppError('INVITE_INVALID');
      return u;
    });
    if (!user || user.passwordHash) throw new AppError('OTP_INVALID');
    return this.auth.startSession(user);
  }

  async bindDevice(userId: string, body: BindDeviceRequest): Promise<Device> {
    if (!(await this.repo.isStudent(userId))) throw new AppError('FORBIDDEN');
    const publicKey = canonicalP256(body.publicKey);
    try {
      const row = await this.repo.bindDevice(userId, publicKey, body.label);
      return { id: row.id, boundAt: row.boundAt.toISOString() };
    } catch (err) {
      const pg = ((err as { cause?: unknown }).cause ?? err) as { code?: string };
      if (pg.code === '23505') throw new AppError('DEVICE_ALREADY_BOUND');
      throw err;
    }
  }
}

/** Parses an SPKI key and re-encodes it, so the same key always stores as the same string. */
export function canonicalP256(spkiBase64url: string) {
  try {
    const key = createPublicKey({
      key: Buffer.from(spkiBase64url, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
      throw new Error('not P-256');
    return key.export({ format: 'der', type: 'spki' }).toString('base64url');
  } catch {
    throw new AppError('DEVICE_KEY_INVALID');
  }
}
