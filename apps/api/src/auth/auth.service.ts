import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  Me,
  RegisterRequest,
  ResetPasswordRequest,
} from '@dafter/contracts';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import { Mailer } from '../student-auth/mailer.js';
import { AuthRepository, type User } from './auth.repository.js';
import { RateLimiter, RateLimitStore } from './rate-limiter.js';
import { hashToken, issueToken } from './tokens.js';

export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Per login: stops guessing one account's password. Per IP, far higher: a center's shared Wi-Fi
// must not lock every staff member out after one person's typos (audit 3 A3), yet one machine
// still can't spray passwords across many accounts.
const LOGIN_MAX_FAILURES = 5;
export const LOGIN_MAX_FAILURES_PER_IP = 50;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const REGISTER_PER_HOUR = 10;
export const RESET_TTL_MS = 30 * 60 * 1000;
// Per email and per IP; every request counts, so the endpoint cannot be used to flood an inbox.
export const RESETS_PER_HOUR = 5;
// Local tools and tests register from loopback; a real client never has it (Render sets the
// client address through X-Forwarded-For, read with TRUST_PROXY=1).
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Compared against when the login matches no user, so both paths take the same argon2 time.
const DUMMY_HASH = hash('dafter-no-such-user');

export interface Session extends AuthResponse {
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly perLogin: RateLimiter;
  private readonly perIp: RateLimiter;
  private readonly registrations: RateLimiter;
  private readonly resets: RateLimiter;
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(AuthRepository) private readonly repo: AuthRepository,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Mailer) private readonly mailer: Mailer,
    @Inject(RateLimitStore) limits: RateLimitStore,
  ) {
    const hour = 60 * 60 * 1000;
    this.perLogin = new RateLimiter(limits, clock, 'login', LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS);
    this.perIp = new RateLimiter(
      limits,
      clock,
      'login-ip',
      LOGIN_MAX_FAILURES_PER_IP,
      LOGIN_WINDOW_MS,
    );
    this.registrations = new RateLimiter(limits, clock, 'register', REGISTER_PER_HOUR, hour);
    this.resets = new RateLimiter(limits, clock, 'reset', RESETS_PER_HOUR, hour);
  }

  async register(input: RegisterRequest, ip: string): Promise<Session> {
    if (!LOOPBACK.has(ip)) {
      // Every attempt counts (not only failures): this limits sign-up spam per address.
      await this.registrations.take([ip]);
    }
    const user = await this.repo
      .createUser({
        name: input.name,
        phone: input.phone,
        email: input.email?.toLowerCase(),
        locale: input.locale,
        passwordHash: await hash(input.password),
      })
      .catch((err: unknown) => {
        throw uniqueViolation(err) ?? err;
      });
    return this.startSession(user, randomUUID());
  }

  async login(input: LoginRequest, ip: string): Promise<Session> {
    const login = [input.login.toLowerCase()];
    await this.perLogin.check(login);
    await this.perIp.check([ip]);
    const user = await this.repo.findUserByLogin(input.login);
    // Students have no password and sign in with a one-time code instead.
    const ok = await verify(user?.passwordHash ?? (await DUMMY_HASH), input.password);
    if (!user?.passwordHash || !ok) {
      await Promise.all([this.perLogin.fail(login), this.perIp.fail([ip])]);
      throw new AppError('INVALID_CREDENTIALS');
    }
    return this.startSession(user, randomUUID());
  }

  async refresh(token: string | undefined): Promise<Session> {
    if (!token) throw new AppError('UNAUTHENTICATED');
    const next = this.newRefresh();
    const result = await this.repo.rotateRefresh(hashToken(token), this.clock.now(), next);
    if (typeof result === 'string') throw new AppError('UNAUTHENTICATED');
    const user = await this.repo.findUserById(result.userId);
    if (!user) throw new AppError('UNAUTHENTICATED');
    return { ...this.accessFor(user), refreshToken: next.token };
  }

  async logout(token: string | undefined) {
    if (token) await this.repo.revokeFamilyOf(hashToken(token), this.clock.now());
  }

  /** Same answer for every email: the link goes out only if a staff account (with a password) has it. */
  async forgotPassword({ email }: ForgotPasswordRequest, ip: string, appUrl: string) {
    await this.resets.take([`email:${email.toLowerCase()}`, `ip:${ip}`]);
    const user = await this.repo.findUserByLogin(email);
    if (!user?.passwordHash) return;
    const { token, tokenHash, expiresAt } = issueToken(this.clock.now(), RESET_TTL_MS);
    await this.repo.insertPasswordReset({ userId: user.id, tokenHash, expiresAt });
    const link = `${appUrl}/reset/${token}`;
    // Not awaited: a slow provider would otherwise tell an attacker that the email exists.
    void this.mailer
      .send(
        user.email!,
        `لتعيين كلمة مرور جديدة لدفتر افتح الرابط خلال 30 دقيقة: ${link}
` + `To set a new Dafter password, open this link within 30 minutes: ${link}`,
        'كلمة مرور جديدة لدفتر · Reset your Dafter password',
      )
      .catch((err: unknown) => this.logger.error(`reset mail failed: ${String(err)}`));
  }

  async resetPassword({ token, password }: ResetPasswordRequest) {
    const ok = await this.repo.resetPassword(
      hashToken(token),
      await hash(password),
      this.clock.now(),
    );
    if (!ok) throw new AppError('RESET_INVALID');
  }

  async me(userId: string): Promise<Me> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new AppError('UNAUTHENTICATED');
    return toMe(user);
  }

  /** Returns the user id from a valid access token, or throws UNAUTHENTICATED. */
  verifyAccess(token: string): string {
    try {
      const nowS = Math.floor(this.clock.now().getTime() / 1000);
      return this.jwt.verify<{ sub: string }>(token, { clockTimestamp: nowS }).sub;
    } catch {
      throw new AppError('UNAUTHENTICATED');
    }
  }

  /** Issues an access token and a new refresh family (staff login and student OTP login). */
  async startSession(user: User, familyId: string = randomUUID()): Promise<Session> {
    const next = this.newRefresh();
    await this.repo.insertRefresh({
      userId: user.id,
      familyId,
      tokenHash: next.tokenHash,
      expiresAt: next.expiresAt,
    });
    return { ...this.accessFor(user), refreshToken: next.token };
  }

  private accessFor(user: User): AuthResponse {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    // iat in the payload makes jsonwebtoken compute exp from our Clock, not Date.now().
    const accessToken = this.jwt.sign({ sub: user.id, iat }, { expiresIn: ACCESS_TTL_S });
    return { accessToken, user: toMe(user) };
  }

  private newRefresh() {
    return issueToken(this.clock.now(), REFRESH_TTL_MS);
  }
}

function toMe(u: User): Me {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    locale: u.locale,
    kind: u.passwordHash ? 'staff' : 'student',
  };
}

function uniqueViolation(err: unknown): AppError | undefined {
  // Drizzle wraps the pg error in `cause`.
  const pg = ((err as { cause?: unknown }).cause ?? err) as { code?: string; constraint?: string };
  if (pg.code !== '23505') return undefined;
  if (pg.constraint === 'users_phone_unique') return new AppError('PHONE_TAKEN');
  if (pg.constraint === 'users_email_lower_key') return new AppError('EMAIL_TAKEN');
  return undefined;
}
