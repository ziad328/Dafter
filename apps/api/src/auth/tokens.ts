import { createHash, randomBytes } from 'node:crypto';

/** Bearer tokens are 256 random bits, so a fast SHA-256 is enough; argon2 is for guessable passwords. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * A new single-use bearer token (refresh token, invite, reset link): the token goes to the client
 * once, only its hash is stored, and it expires `ttlMs` after `now` (the injected Clock's time).
 */
export function issueToken(now: Date, ttlMs: number) {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + ttlMs) };
}
