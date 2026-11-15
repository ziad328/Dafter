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
