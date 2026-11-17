import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { rateLimits } from '@dafter/db';
import { useTestDb } from '@dafter/db/testing';
import { FakeClock } from '../clock.js';
import {
  MemoryRateLimitStore,
  PgRateLimitStore,
  RateLimiter,
  type RateLimitStore,
  sweepRateLimits,
} from './rate-limiter.js';

const testDb = useTestDb();
let n = 0;

// The same rules for both stores: memory is what unit tests build services with.
describe.each([
  ['PostgreSQL', () => new PgRateLimitStore(testDb().db) as RateLimitStore],
  ['memory', () => new MemoryRateLimitStore() as RateLimitStore],
])('RateLimiter (%s)', (_, store) => {
  const make = (max: number) => {
    const clock = new FakeClock();
    // A fresh name per test: the PostgreSQL rows are shared by the whole file.
    return { clock, limiter: new RateLimiter(store(), clock, `t${++n}`, max, 60_000) };
  };
  const blocked = async (limiter: RateLimiter, keys: string[]) =>
    (await limiter.retryAfterMs(keys)) > 0;

  it('blocks a key after max failures until the window ends', async () => {
    const { clock, limiter } = make(3);
    await limiter.fail(['a']);
    await limiter.fail(['a']);
    expect(await blocked(limiter, ['a'])).toBe(false);
    await limiter.fail(['a']);
    expect(await blocked(limiter, ['a'])).toBe(true);
    expect(await blocked(limiter, ['b'])).toBe(false);
    expect(await blocked(limiter, ['b', 'a'])).toBe(true);
    clock.advance(60_000);
    expect(await blocked(limiter, ['a'])).toBe(false);
    // A new window starts from one.
    await limiter.fail(['a']);
    expect(await blocked(limiter, ['a'])).toBe(false);
  });

  it('says how long until every blocked key frees up, and throws RATE_LIMITED with it', async () => {
    const { clock, limiter } = make(1);
    expect(await limiter.retryAfterMs(['a'])).toBe(0);
    await expect(limiter.check(['a'])).resolves.toBeUndefined();
    await limiter.fail(['a']);
    clock.advance(20_000);
    await limiter.fail(['b']);
    // 'a' frees in 40 s, 'b' in 60 s: the wait is the longer one.
    expect(await limiter.retryAfterMs(['a', 'b'])).toBe(60_000);
    clock.advance(500);
    await expect(limiter.check(['a'])).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: 40 },
    });
  });

  it('take counts every attempt and refuses once a key reaches max', async () => {
    const { clock, limiter } = make(2);
    await limiter.take(['a', 's']);
    await limiter.take(['b', 's']);
    await expect(limiter.take(['c', 's'])).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await limiter.take(['c']);
    clock.advance(60_000);
    await expect(limiter.take(['s'])).resolves.toBeUndefined();
  });

  it('counts a key once when a call repeats it', async () => {
    const { limiter } = make(2);
    await limiter.take(['a', 'a']);
    await expect(limiter.take(['a'])).resolves.toBeUndefined();
  });
});

describe('PgRateLimitStore', () => {
  it('keeps a lockout across a restart (a new store and limiter on the same database)', async () => {
    const clock = new FakeClock();
    const name = `restart${++n}`;
    const before = new RateLimiter(new PgRateLimitStore(testDb().db), clock, name, 2, 60_000);
    await before.fail(['x']);
    await before.fail(['x']);
    const after = new RateLimiter(new PgRateLimitStore(testDb().db), clock, name, 2, 60_000);
    await expect(after.check(['x'])).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('lets exactly max of many parallel takes through', async () => {
    const clock = new FakeClock();
    const limiter = new RateLimiter(
      new PgRateLimitStore(testDb().db),
      clock,
      `race${++n}`,
      5,
      60_000,
    );
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => limiter.take(['door'])),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
  });

  it('the sweep drops only counters whose window has ended', async () => {
    const clock = new FakeClock();
    const db = testDb().db;
    const store = new PgRateLimitStore(db);
    const old = new RateLimiter(store, clock, `sweep-old${++n}`, 5, 1_000);
    const fresh = new RateLimiter(store, clock, `sweep-new${n}`, 5, 60_000);
    await old.fail(['k']);
    await fresh.fail(['k']);
    clock.advance(2_000);
    expect(await sweepRateLimits(db, clock)).toBeGreaterThanOrEqual(1);
    const left = async (key: string) =>
      (await db.select().from(rateLimits).where(eq(rateLimits.key, key))).length;
    expect(await left(`sweep-old${n}:k`)).toBe(0);
    expect(await left(`sweep-new${n}:k`)).toBe(1);
  });
});
