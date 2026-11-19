import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  CreateCurriculumRequest,
  CurriculumEntry,
  UpdateCurriculumRequest,
} from '@dafter/contracts';
import { gradeLevels, subjects } from '@dafter/db';
import { TenantRepository } from '../tenant.repository.js';

export type CurriculumTable = typeof subjects | typeof gradeLevels;

const columns = (t: CurriculumTable) => ({
  id: t.id,
  nameAr: t.nameAr,
  nameEn: t.nameEn,
  status: t.status,
});

/** A workspace's own copy of the subjects and grade levels (see `insertCurriculum`). */
@Injectable()
export class CurriculumRepository extends TenantRepository {
  list(workspaceId: string, table: CurriculumTable): Promise<CurriculumEntry[]> {
    return this.inTenant(workspaceId, (tx) =>
      tx
        .select(columns(table))
        .from(table)
        .where(eq(table.workspaceId, workspaceId))
        .orderBy(asc(table.sortOrder), asc(table.createdAt)),
    );
  }

  /** Added at the end of the list. Two adds at once may share a sort order; createdAt breaks the tie. */
  async create(
    workspaceId: string,
    table: CurriculumTable,
    body: CreateCurriculumRequest,
  ): Promise<CurriculumEntry> {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .insert(table)
        .values({
          workspaceId,
          nameAr: body.nameAr,
          nameEn: body.nameEn ?? body.nameAr,
          sortOrder: sql`(select coalesce(max(${table.sortOrder}), 0) + 1 from ${table} where ${table.workspaceId} = ${workspaceId})`,
        })
        .returning(columns(table)),
    );
    return row!;
  }

  /**
   * Rewrites sort_order as 1..n in the given order, under a per-workspace lock so two reorders run
   * one after the other. False when the ids are not exactly the list.
   */
  reorder(workspaceId: string, table: CurriculumTable, ids: string[]) {
    return this.inTenant(workspaceId, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`curriculum:${workspaceId}`}, 0))`,
      );
      const rows = await tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.workspaceId, workspaceId));
      const known = new Set(rows.map((r) => r.id));
      if (new Set(ids).size !== ids.length || ids.length !== known.size) return false;
      if (!ids.every((id) => known.has(id))) return false;
      // One statement: unnest pairs each id with its new position.
      await tx.execute(sql`
        update ${table} set sort_order = o.pos
        from unnest(${`{${ids.join(',')}}`}::uuid[]) with ordinality as o(id, pos)
        where ${table.workspaceId} = ${workspaceId} and ${table.id} = o.id`);
      return true;
    });
  }

  async update(
    workspaceId: string,
    table: CurriculumTable,
    id: string,
    patch: UpdateCurriculumRequest,
  ): Promise<CurriculumEntry | undefined> {
    const where = and(eq(table.workspaceId, workspaceId), eq(table.id, id));
    const [row] = await this.inTenant(workspaceId, (tx) =>
      // An empty patch changes nothing: return the item as it is.
      Object.keys(patch).length
        ? tx.update(table).set(patch).where(where).returning(columns(table))
        : tx.select(columns(table)).from(table).where(where),
    );
    return row;
  }
}
