import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { workspaces } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { forEachWorkspace } from './for-each-workspace.js';

const testDb = useTestDb();

describe('forEachWorkspace', () => {
  it('pages through every workspace, each in its own tenant, and keeps going past a failure', async () => {
    const db = testDb().db;
    await db
      .insert(workspaces)
      .values(Array.from({ length: 5 }, (_, i) => ({ type: 'center' as const, nameAr: `س ${i}` })));
    const all = (await db.select({ id: workspaces.id }).from(workspaces)).map((w) => w.id).sort();
    const [broken] = all;
    const seen: string[] = [];
    const log = { error: vi.fn() };
    const total = await forEachWorkspace(
      db,
      'test-job',
      async (tx, id) => {
        // Inside that workspace's transaction.
        const { rows } = await tx.execute<{ ws: string }>(sql`select app_workspace_id() as ws`);
        expect(rows[0]!.ws).toBe(id);
        if (id === broken) throw new Error('boom');
        seen.push(id);
        return 2;
      },
      { batch: 2, log },
    );
    expect(seen).toEqual(all.slice(1));
    expect(total).toBe(2 * (all.length - 1));
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining(`test-job failed for workspace ${broken}`),
    );
  });

  it('logs with a Nest logger by default and returns 0 for no work', async () => {
    expect(await forEachWorkspace(testDb().db, 'noop', async () => 0)).toBe(0);
  });
});
