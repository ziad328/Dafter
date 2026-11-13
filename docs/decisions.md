# Decisions

Short records of design choices: decision, alternatives, why.

## 2026-11-13 · Staff auth: short JWT + rotating refresh token with family reuse detection

- **Decision:** 15-minute HS256 access JWT kept in memory; 256-bit random refresh token in an httpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`, stored as a SHA-256 hash, rotated on every refresh inside a `FOR UPDATE` transaction; a revoked token coming back revokes its whole family.
- **Alternatives:** a long-lived JWT in localStorage (cannot be revoked, readable by any XSS); server-side sessions (a database read on every request).
- **Why:** only `/auth/refresh` touches the database, a stolen refresh token works at most once before reuse is detected, and logout really ends the session. Cost: two tabs refreshing at the same moment look like reuse and sign the user out.
