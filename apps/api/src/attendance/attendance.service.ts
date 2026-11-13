import { createPublicKey, verify } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { defer, merge, mergeMap } from 'rxjs';
import type {
  AttendanceRecord,
  CheckIn,
  CheckInRequest,
  MarkAttendanceRequest,
  OpenSession,
} from '@dafter/contracts';
import { Clock } from '../clock.js';
import { AppError } from '../errors.js';
import { SessionsService } from '../sessions/sessions.service.js';
import type { TenantedRequest } from '../workspaces/tenant.guard.js';
import { AttendanceRepository } from './attendance.repository.js';
import { LiveAttendance } from './live.js';
import { macMatches, parseQr, sessionKey, WINDOW_MS, windowAt } from './qr.js';

type Ctx = Pick<TenantedRequest, 'workspaceId' | 'role' | 'membershipId'>;

/**
 * Policy: whoever sees the session (owner, its teacher, an assigned assistant) can open it,
 * read its attendance and mark by hand; the assistant runs the door. Students only scan.
 */
@Injectable()
export class AttendanceService {
  private readonly secret: string;

  constructor(
    @Inject(AttendanceRepository) private readonly repo: AttendanceRepository,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(LiveAttendance) private readonly live: LiveAttendance,
  ) {
    const secret = process.env.QR_SECRET;
    if (!secret) throw new Error('QR_SECRET is not set');
    this.secret = secret;
  }

  async open(ctx: Ctx, id: string): Promise<OpenSession> {
    await this.sessions.get(ctx, id);
    const now = this.clock.now();
    if (!(await this.repo.open(ctx.workspaceId, id, now)))
      throw new AppError('SESSION_NOT_SCHEDULED');
    return {
      sessionId: id,
      qrKey: sessionKey(this.secret, id).toString('base64url'),
      serverTime: now.toISOString(),
      windowMs: WINDOW_MS,
    };
  }

  async list(ctx: Ctx, id: string): Promise<AttendanceRecord[]> {
    await this.sessions.get(ctx, id);
    return this.repo.listForSession(ctx.workspaceId, id);
  }

  async mark(
    ctx: Ctx,
    id: string,
    studentId: string,
    body: MarkAttendanceRequest,
    actorId: string,
  ): Promise<AttendanceRecord> {
    const session = await this.sessions.get(ctx, id);
    // Closed stays editable so a mistake can be fixed after class.
    if (session.status !== 'open' && session.status !== 'closed')
      throw new AppError('SESSION_NOT_OPEN');
    if (!(await this.repo.studentExists(ctx.workspaceId, studentId)))
      throw new AppError('STUDENT_NOT_FOUND');
    const record = await this.repo.mark(
      ctx.workspaceId,
      id,
      studentId,
      body.status,
      actorId,
      this.clock.now(),
    );
    this.live.publish(id, [record]);
    return record;
  }

  async close(ctx: Ctx, id: string, actorId: string): Promise<AttendanceRecord[]> {
    await this.sessions.get(ctx, id);
    const records = await this.repo.close(ctx.workspaceId, id, actorId, this.clock.now());
    if (!records) throw new AppError('SESSION_NOT_OPEN');
    this.live.publish(
      id,
      records.filter((r) => r.method === 'auto_close'),
    );
    return records;
  }

  /** Visibility is checked by the route's guard, before the stream starts. */
  liveFeed(ctx: Ctx, id: string) {
    // Live first, then the snapshot: nothing is missed in between. The client keeps the newest
    // record per student, so a snapshot row arriving after a live one does not win.
    return merge(
      this.live.of(id),
      defer(() => this.repo.listForSession(ctx.workspaceId, id)).pipe(mergeMap((rows) => rows)),
    );
  }

  /**
   * Checks, cheapest and least revealing first: the code's MAC (forged or foreign codes stop
   * here), its window (current or previous, about 20 s), the phone's signature over the exact
   * code (so only the bound phone can use it), then the session and the student's record.
   */
  async checkIn(userId: string, body: CheckInRequest): Promise<CheckIn> {
    const qr = parseQr(body.code);
    if (!qr || !macMatches(sessionKey(this.secret, qr.sessionId), qr.sessionId, qr.window, qr.mac))
      throw new AppError('CHECKIN_CODE_INVALID');
    const now = this.clock.now();
    const current = windowAt(now.getTime());
    if (qr.window > current) throw new AppError('CHECKIN_CODE_INVALID');
    if (qr.window < current - 1) throw new AppError('CHECKIN_CODE_EXPIRED');

    const device = await this.repo.activeDevice(userId);
    if (!device) throw new AppError('DEVICE_NOT_BOUND');
    if (!signedBy(device.publicKey, body.code, body.signature))
      throw new AppError('DEVICE_SIGNATURE_INVALID');

    const session = await this.repo.sessionForCheckIn(qr.sessionId);
    if (!session) throw new AppError('SESSION_NOT_FOUND');
    if (session.status !== 'open') throw new AppError('SESSION_NOT_OPEN');
    const lateAt = new Date(session.startsAt.getTime() + session.lateAfterMinutes * 60_000);
    const record = await this.repo.scan(
      session.workspaceId,
      { sessionId: qr.sessionId, groupId: session.groupId, lateAt },
      userId,
      { deviceId: device.id, qrWindow: qr.window },
      now,
    );
    if (record === 'not_open') throw new AppError('SESSION_NOT_OPEN');
    // Not a student of this center: same answer as an unknown session.
    if (!record) throw new AppError('SESSION_NOT_FOUND');
    this.live.publish(qr.sessionId, [record]);
    const { id, status, recordedAt } = record;
    return { id, sessionId: qr.sessionId, status, recordedAt };
  }
}

/** WebCrypto ECDSA signs in IEEE P1363 (raw r||s), not DER. */
function signedBy(spki: string, data: string, signature: string) {
  try {
    const key = createPublicKey({
      key: Buffer.from(spki, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    return verify(
      'sha256',
      Buffer.from(data),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}
