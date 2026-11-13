import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreatePaymentRequest, LedgerEntry, Receipt, StudentLedger } from '@dafter/contracts';
import { AppError } from '../errors.js';
import { GroupsService } from '../groups/groups.service.js';
import type { TenantedRequest } from '../workspaces/tenant.guard.js';
import { type Idempotency, MoneyRepository, type Repeat } from './money.repository.js';

type Ctx = Pick<TenantedRequest, 'workspaceId' | 'role' | 'membershipId' | 'userId'>;

/** A phone may retry a payment; the key (8-100 chars) makes the retry return the first entry. */
export function idempotency(header: unknown, request: unknown[]): Idempotency {
  if (typeof header !== 'string' || header.length < 8 || header.length > 100)
    throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
  return { key: header, hash: createHash('sha256').update(JSON.stringify(request)).digest('hex') };
}

/**
 * Policy: money follows group visibility. Owner: every group. Teacher: own groups. Assistant:
 * their teachers' groups (records payments at the door). A reversal: the owner, or whoever
 * recorded the entry. Students only see their own balance later (not in v0).
 */
@Injectable()
export class MoneyService {
  constructor(
    @Inject(MoneyRepository) private readonly repo: MoneyRepository,
    @Inject(GroupsService) private readonly groups: GroupsService,
  ) {}

  async ledger(ctx: Ctx, studentId: string): Promise<StudentLedger> {
    if (!(await this.repo.studentExists(ctx.workspaceId, studentId)))
      throw new AppError('STUDENT_NOT_FOUND');
    const entries = await this.repo.list(
      ctx.workspaceId,
      { studentId },
      await this.groups.visibleTeachers(ctx),
    );
    return { balancePiastres: entries.reduce((sum, e) => sum + e.amountPiastres, 0), entries };
  }

  async pay(ctx: Ctx, body: CreatePaymentRequest, key: unknown): Promise<LedgerEntry> {
    const idem = idempotency(key, [
      body.studentId,
      body.groupId,
      body.amountPiastres,
      body.method,
      body.note ?? null,
    ]);
    await this.groups.get(ctx, body.groupId);
    if (!(await this.repo.studentExists(ctx.workspaceId, body.studentId)))
      throw new AppError('STUDENT_NOT_FOUND');
    // Money goes to a group the student is or was in, so its teacher's view stays right.
    if (!(await this.repo.everEnrolled(ctx.workspaceId, body.studentId, body.groupId)))
      throw new AppError('STUDENT_REFERENCE_INVALID', { field: 'groupId' });
    return this.found(ctx, await this.repo.pay(ctx.workspaceId, body, ctx.userId, idem));
  }

  async reverse(ctx: Ctx, id: string, key: unknown): Promise<LedgerEntry> {
    const idem = idempotency(key, ['reverse', id]);
    const entry = await this.repo.entry(ctx.workspaceId, id);
    if (!entry) throw new AppError('ENTRY_NOT_FOUND');
    await this.groups.get(ctx, entry.groupId).catch((err: unknown) => {
      throw err instanceof AppError && err.code === 'GROUP_NOT_FOUND'
        ? new AppError('ENTRY_NOT_FOUND')
        : err;
    });
    if (entry.type === 'reversal') throw new AppError('ENTRY_NOT_REVERSIBLE');
    if (ctx.role !== 'owner' && entry.createdBy !== ctx.userId) throw new AppError('FORBIDDEN');
    const result = await this.repo.reverse(ctx.workspaceId, entry, ctx.userId, idem);
    if (result === 'already') throw new AppError('ENTRY_ALREADY_REVERSED');
    return this.found(ctx, result);
  }

  async receipt(ctx: Ctx, id: string): Promise<Receipt> {
    const [entry] = await this.repo.list(
      ctx.workspaceId,
      { id },
      await this.groups.visibleTeachers(ctx),
    );
    // Only payments have receipts; a charge or reversal must never print as one.
    const context =
      entry?.type === 'payment' && (await this.repo.receiptContext(ctx.workspaceId, id));
    if (!entry || !context) throw new AppError('ENTRY_NOT_FOUND');
    return { entry, ...context };
  }

  private async found(ctx: Ctx, result: Repeat) {
    if (result === 'reused') throw new AppError('IDEMPOTENCY_KEY_REUSED');
    const [entry] = await this.repo.list(ctx.workspaceId, { id: result.id });
    return entry!;
  }
}
