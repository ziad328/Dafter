import { Inject, Injectable } from '@nestjs/common';
import { lt, type SQL, sql } from 'drizzle-orm';
import { type Db, rateLimits } from '@dafter/db';
import type { Clock } from '../clock.js';
import { DB } from '../db.js';
import { AppError } from '../errors.js';

/**
 * Where the counters live. The token class for Nest; PostgreSQL in the app, memory in unit tests.
 * Every call takes `now` from the Clock (never the database's now()), so fake time works.
 */
export abstract class RateLimitStore {
  /** Milliseconds until no key in `keys` is at `max` any more; 0 when none is. */
  abstract waitMs(keys: string[], max: number, now: Date): Promise<number>;
  /** Counts one hit on every key, starting a new window for a key whose window has ended. */
  abstract hit(keys: string[], windowMs: number, now: Date): Promise<void>;
  /** Counts one hit on every key still under `max`; true when some key was already full. */
  abstract take(keys: string[], max: number, windowMs: number, now: Date): Promise<boolean>;
}

const list = (keys: string[]) =>
  sql`ARRAY[${sql.join(
    keys.map((k) => sql`${k}`),
    sql`, `,
  )}]::text[]`;
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/**
 * One row per key in `rate_limits`, so a restart or a sleeping free-tier instance keeps every
 * lockout. Each hit is a single upsert: PostgreSQL locks the key's row, so two requests at once
 * are counted one after the other and can't both slip under the limit.
 */
@Injectable()
export class PgRateLimitStore extends RateLimitStore {
  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async waitMs(keys: string[], max: number, now: Date) {
    const { rows } = await this.db.execute<{ until: string | null }>(sql`
      SELECT max(reset_at) AS until FROM rate_limits
      WHERE key = ANY(${list(keys)}) AND reset_at > ${ts(now)} AND count >= ${max}`);
    const until = rows[0]?.until;
    return until ? Math.max(0, new Date(until).getTime() - now.getTime()) : 0;
  }

  async hit(keys: string[], windowMs: number, now: Date) {
    await this.db.execute(this.upsert(keys, windowMs, now));
  }

  async take(keys: string[], max: number, windowMs: number, now: Date) {
    // The WHERE skips a full key inside its window: its row is neither counted nor returned.
    const { rows } = await this.db.execute(
      this.upsert(
        keys,
        windowMs,
        now,
        sql`WHERE rate_limits.reset_at <= ${ts(now)}
        OR rate_limits.count < ${max}`,
      ),
    );
    return rows.length < keys.length;
  }

  private upsert(keys: string[], windowMs: number, now: Date, where: SQL = sql``) {
    const expired = sql`rate_limits.reset_at <= ${ts(now)}`;
    return sql`
      INSERT INTO rate_limits (key, count, reset_at)
      SELECT k, 1, ${ts(new Date(now.getTime() + windowMs))} FROM unnest(${list(keys)}) AS k
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN ${expired} THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN ${expired} THEN excluded.reset_at ELSE rate_limits.reset_at END
      ${where}
      RETURNING key`;
  }
}

/** The same rules in memory, for unit tests that build services by hand. */
export class MemoryRateLimitStore extends RateLimitStore {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  async waitMs(keys: string[], max: number, now: Date) {
    let wait = 0;
    for (const k of keys) {
      const h = this.hits.get(k);
      if (h && h.resetAt > now.getTime() && h.count >= max)
        wait = Math.max(wait, h.resetAt - now.getTime());
    }
    return wait;
  }

  async hit(keys: string[], windowMs: number, now: Date) {
    for (const k of keys) this.count(k, windowMs, now);
  }

  async take(keys: string[], max: number, windowMs: number, now: Date) {
    let refused = false;
    for (const k of keys) {
      const h = this.hits.get(k);
      if (h && h.resetAt > now.getTime() && h.count >= max) refused = true;
      else this.count(k, windowMs, now);
    }
    return refused;
  }

  private count(k: string, windowMs: number, now: Date) {
    const h = this.hits.get(k);
    if (h && h.resetAt > now.getTime()) h.count++;
    else this.hits.set(k, { count: 1, resetAt: now.getTime() + windowMs });
  }
}

/** Drops counters whose window has ended; run by the daily job. */
export async function sweepRateLimits(db: Db, clock: Clock) {
  const gone = await db
    .delete(rateLimits)
    .where(lt(rateLimits.resetAt, clock.now()))
    .returning({ key: rateLimits.key });
  return gone.length;
}

/**
 * Fixed-window counter: after `max` hits for a key, that key is blocked until the window ends.
 * Login counts failures (`fail`); check-ins count every attempt (`take`). Keys are prefixed with
 * the limiter's name, so two limiters never share a counter.
 */
export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly clock: Clock,
    private readonly name: string,
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  // Unique keys: one upsert can't touch the same row twice.
  private keys(keys: string[]) {
    return [...new Set(keys)].map((k) => `${this.name}:${k}`);
  }

  /** Milliseconds until no key in `keys` is at its limit any more; 0 when none is. */
  retryAfterMs(keys: string[]) {
    return this.store.waitMs(this.keys(keys), this.max, this.clock.now());
  }

  /** RATE_LIMITED with the wait in whole seconds, so the screen can say «حاول بعد 15 دقيقة». */
  async error(keys: string[]) {
    return new AppError('RATE_LIMITED', {
      retryAfterSeconds: Math.ceil((await this.retryAfterMs(keys)) / 1000),
    });
  }

  /** Throws RATE_LIMITED (with the wait) when any key is at its limit. */
  async check(keys: string[]) {
    if ((await this.retryAfterMs(keys)) > 0) throw await this.error(keys);
  }

  fail(keys: string[]) {
    return this.store.hit(this.keys(keys), this.windowMs, this.clock.now());
  }

  /** Counts one attempt for every key; throws RATE_LIMITED when a key was already at its limit. */
  async take(keys: string[]) {
    const refused = await this.store.take(
      this.keys(keys),
      this.max,
      this.windowMs,
      this.clock.now(),
    );
    if (refused) throw await this.error(keys);
  }
}
