import { expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { RateLimiter } from './rate-limiter.js';

it('blocks a key after max failures until the window ends', () => {
  const clock = new FakeClock();
  const limiter = new RateLimiter(clock, 3, 60_000);
  limiter.fail(['a']);
  limiter.fail(['a']);
  expect(limiter.isBlocked(['a'])).toBe(false);
  limiter.fail(['a']);
  expect(limiter.isBlocked(['a'])).toBe(true);
  expect(limiter.isBlocked(['b'])).toBe(false);
  expect(limiter.isBlocked(['b', 'a'])).toBe(true);
  clock.advance(60_000);
  expect(limiter.isBlocked(['a'])).toBe(false);
});

it('says how long until every blocked key frees up, and throws RATE_LIMITED with it', () => {
  const clock = new FakeClock();
  const limiter = new RateLimiter(clock, 1, 60_000);
  expect(limiter.retryAfterMs(['a'])).toBe(0);
  expect(() => limiter.check(['a'])).not.toThrow();
  limiter.fail(['a']);
  clock.advance(20_000);
  limiter.fail(['b']);
  // 'a' frees in 40 s, 'b' in 60 s: the wait is the longer one.
  expect(limiter.retryAfterMs(['a', 'b'])).toBe(60_000);
  clock.advance(500);
  expect(() => limiter.check(['a'])).toThrow(
    expect.objectContaining({ code: 'RATE_LIMITED', details: { retryAfterSeconds: 40 } }),
  );
});

it('take counts every attempt and refuses once a key reaches max', () => {
  const clock = new FakeClock();
  const limiter = new RateLimiter(clock, 2, 60_000);
  expect(limiter.take(['a', 's'])).toBe(false);
  expect(limiter.take(['b', 's'])).toBe(false);
  // 's' is full: refused, and 'c' is not counted.
  expect(limiter.take(['c', 's'])).toBe(true);
  expect(limiter.take(['c'])).toBe(false);
  clock.advance(60_000);
  expect(limiter.take(['s'])).toBe(false);
});
