import type { Clock } from '../clock.js';
import { AppError } from '../errors.js';

/**
 * Fixed-window counter: after `max` hits for a key, that key is blocked until the window ends.
 * Login counts failures (`fail`); check-ins count every attempt (`take`).
 * shortcut: in-process memory, so limits reset on restart and are per instance; move to Redis at the VPS stage.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private sweptAt = 0;

  constructor(
    private readonly clock: Clock,
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  isBlocked(keys: string[]) {
    return this.retryAfterMs(keys) > 0;
  }

  /** Milliseconds until no key in `keys` is at its limit any more; 0 when none is. */
  retryAfterMs(keys: string[]) {
    const now = this.clock.now().getTime();
    let wait = 0;
    for (const k of keys) {
      const h = this.hits.get(k);
      if (h && h.resetAt > now && h.count >= this.max) wait = Math.max(wait, h.resetAt - now);
    }
    return wait;
  }

  /** RATE_LIMITED with the wait in whole seconds, so the screen can say «حاول بعد 15 دقيقة». */
  error(keys: string[]) {
    return new AppError('RATE_LIMITED', {
      retryAfterSeconds: Math.ceil(this.retryAfterMs(keys) / 1000),
    });
  }

  /** Throws RATE_LIMITED (with the wait) when any key is at its limit. */
  check(keys: string[]) {
    if (this.isBlocked(keys)) throw this.error(keys);
  }

  fail(keys: string[]) {
    const now = this.clock.now().getTime();
    // Expired keys are dropped at most once a window, not on every hit (check-ins are hot).
    if (now - this.sweptAt >= this.windowMs) {
      this.sweptAt = now;
      for (const [k, h] of this.hits) if (h.resetAt <= now) this.hits.delete(k);
    }
    for (const k of keys) {
      const h = this.hits.get(k);
      if (h) h.count++;
      else this.hits.set(k, { count: 1, resetAt: now + this.windowMs });
    }
  }

  /** Counts one attempt for every key; true when any key was already at its limit (not counted). */
  take(keys: string[]) {
    if (this.isBlocked(keys)) return true;
    this.fail(keys);
    return false;
  }
}
