import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CreatePaymentRequest, LedgerEntry } from '@dafter/contracts';
import {
  enrollments,
  groups,
  ledgerEntries,
  receiptCounters,
  students,
  subjects,
  type Tx,
  users,
  workspaces,
} from '@dafter/db';
import { TenantRepository } from '../tenant.repository.js';

/** Thrown inside a transaction to roll it back and return an earlier entry instead. */
class Existing {
  constructor(readonly earlier: { id: string; hash: string | null }) {}
}

/** The earlier entry for this key, unless the key was used for a different request. */
const repeat = (earlier: { id: string; hash: string | null }, hash: string): Repeat =>
  earlier.hash === hash ? { id: earlier.id } : 'reused';

export type Idempotency = { key: string; hash: string };
export type Repeat = { id: string } | 'reused';

@Injectable()
export class MoneyRepository extends TenantRepository {
  /**
   * Payments: one per Idempotency-Key. The receipt counter row is bumped first, which also
   * serializes payments in a workspace; the key is then checked again, so a retry racing its
   * original rolls back (no receipt-number gap) and returns the original.
   */
  async pay(
    workspaceId: string,
    body: CreatePaymentRequest,
    actorId: string,
    idem: Idempotency,
  ): Promise<Repeat> {
    try {
      return await this.inTenant(workspaceId, async (tx) => {
        const [counter] = await tx
          .insert(receiptCounters)
          .values({ workspaceId, last: 1 })
          .onConflictDoUpdate({
            target: receiptCounters.workspaceId,
            set: { last: sql`${receiptCounters.last} + 1` },
          })
          .returning({ last: receiptCounters.last });
        const earlier = await this.byKey(tx, workspaceId, idem.key);
        if (earlier) throw new Existing(earlier);
        const [row] = await tx
          .insert(ledgerEntries)
          .values({
            workspaceId,
            studentId: body.studentId,
            groupId: body.groupId,
            type: 'payment',
            amountPiastres: -body.amountPiastres,
            method: body.method,
            receiptNo: counter!.last,
            note: body.note,
            idempotencyKey: idem.key,
            requestHash: idem.hash,
            createdBy: actorId,
          })
          .returning({ id: ledgerEntries.id });
        return { id: row!.id };
      });
    } catch (e) {
      if (!(e instanceof Existing)) throw e;
      return repeat(e.earlier, idem.hash);
    }
  }

  /** A new entry of minus the original. One reversal per entry (unique reverses_entry_id). */
  async reverse(
    workspaceId: string,
    entry: { id: string; studentId: string; groupId: string; amountPiastres: number },
    actorId: string,
    idem: Idempotency,
  ): Promise<Repeat | 'already'> {
    const earlier = await this.inTenant(workspaceId, (tx) => this.byKey(tx, workspaceId, idem.key));
    if (earlier) return repeat(earlier, idem.hash);
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .insert(ledgerEntries)
        .values({
          workspaceId,
          studentId: entry.studentId,
          groupId: entry.groupId,
          type: 'reversal',
          amountPiastres: -entry.amountPiastres,
          reversesEntryId: entry.id,
          idempotencyKey: idem.key,
          requestHash: idem.hash,
          createdBy: actorId,
        })
        .onConflictDoNothing()
        .returning({ id: ledgerEntries.id }),
    );
    if (row) return { id: row.id };
    // Either the entry was reversed meanwhile, or this key's twin committed first.
    const twin = await this.inTenant(workspaceId, (tx) => this.byKey(tx, workspaceId, idem.key));
    return twin ? repeat(twin, idem.hash) : 'already';
  }

  async entry(workspaceId: string, id: string) {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({
          id: ledgerEntries.id,
          type: ledgerEntries.type,
          studentId: ledgerEntries.studentId,
          groupId: ledgerEntries.groupId,
          amountPiastres: ledgerEntries.amountPiastres,
          createdBy: ledgerEntries.createdBy,
        })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.workspaceId, workspaceId), eq(ledgerEntries.id, id))),
    );
    return row;
  }

  /** Entries of the given students' groups the caller can see (teachers = undefined: all). */
  list(
    workspaceId: string,
    filter: { studentId?: string; id?: string },
    teachers?: string[],
  ): Promise<LedgerEntry[]> {
    return this.inTenant(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          id: ledgerEntries.id,
          type: ledgerEntries.type,
          amountPiastres: ledgerEntries.amountPiastres,
          method: ledgerEntries.method,
          receiptNo: ledgerEntries.receiptNo,
          period: ledgerEntries.period,
          groupId: ledgerEntries.groupId,
          subject: { id: subjects.id, nameAr: subjects.nameAr, nameEn: subjects.nameEn },
          reversesEntryId: ledgerEntries.reversesEntryId,
          reversedById: sql<
            string | null
          >`(select r.id from ledger_entries r where r.workspace_id = ${ledgerEntries.workspaceId} and r.reverses_entry_id = ${ledgerEntries.id})`,
          note: ledgerEntries.note,
          createdByName: users.name,
          createdAt: ledgerEntries.createdAt,
        })
        .from(ledgerEntries)
        .innerJoin(groups, eq(groups.id, ledgerEntries.groupId))
        .innerJoin(subjects, eq(subjects.id, groups.subjectId))
        .leftJoin(users, eq(users.id, ledgerEntries.createdBy))
        .where(
          and(
            eq(ledgerEntries.workspaceId, workspaceId),
            filter.studentId ? eq(ledgerEntries.studentId, filter.studentId) : undefined,
            filter.id ? eq(ledgerEntries.id, filter.id) : undefined,
            teachers ? inArray(groups.teacherMembershipId, teachers) : undefined,
          ),
        )
        .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.receiptNo));
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    });
  }

  async studentExists(workspaceId: string, id: string) {
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.workspaceId, workspaceId), eq(students.id, id))),
    );
    return rows.length > 0;
  }

  /** Ever enrolled (a former student may still settle an old debt). */
  async everEnrolled(workspaceId: string, studentId: string, groupId: string) {
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.workspaceId, workspaceId),
            eq(enrollments.studentId, studentId),
            eq(enrollments.groupId, groupId),
          ),
        )
        .limit(1),
    );
    return rows.length > 0;
  }

  async receiptContext(workspaceId: string, id: string) {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({
          studentName: students.nameAr,
          center: { nameAr: workspaces.nameAr, nameEn: workspaces.nameEn },
          timezone: workspaces.timezone,
        })
        .from(ledgerEntries)
        .innerJoin(students, eq(students.id, ledgerEntries.studentId))
        .innerJoin(workspaces, eq(workspaces.id, ledgerEntries.workspaceId))
        .where(and(eq(ledgerEntries.workspaceId, workspaceId), eq(ledgerEntries.id, id))),
    );
    return row;
  }

  private async byKey(tx: Tx, workspaceId: string, key: string) {
    const [row] = await tx
      .select({ id: ledgerEntries.id, hash: ledgerEntries.requestHash })
      .from(ledgerEntries)
      .where(
        and(eq(ledgerEntries.workspaceId, workspaceId), eq(ledgerEntries.idempotencyKey, key)),
      );
    return row;
  }
}
