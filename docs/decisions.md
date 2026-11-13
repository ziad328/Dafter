# Decisions

Short records of design choices: decision, alternatives, why.

## 2026-11-13 · Staff auth: short JWT + rotating refresh token with family reuse detection

- **Decision:** 15-minute HS256 access JWT kept in memory; 256-bit random refresh token in an httpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`, stored as a SHA-256 hash, rotated on every refresh inside a `FOR UPDATE` transaction; a revoked token coming back revokes its whole family.
- **Alternatives:** a long-lived JWT in localStorage (cannot be revoked, readable by any XSS); server-side sessions (a database read on every request).
- **Why:** only `/auth/refresh` touches the database, a stolen refresh token works at most once before reuse is detected, and logout really ends the session. Cost: two tabs refreshing at the same moment look like reuse and sign the user out.

## 2026-11-13 · Tenant isolation: `SET LOCAL ROLE dafter_app` per tenant transaction, RLS as backstop

- **Decision:** the API connects as the table owner; every tenant query goes through `withTenant`, which starts a transaction with `SET LOCAL ROLE dafter_app` (NOLOGIN, NOBYPASSRLS) and `set_config('app.workspace_id', id, true)`. Policies compare `workspace_id` with that setting; unset means no rows.
- **Alternatives:** `FORCE ROW LEVEL SECURITY` on the owner (superusers skip RLS anyway, so it would silently do nothing in local dev and tests); a separate login role with its own `DATABASE_URL` (same guarantee, two secrets on every host).
- **Why:** one connection string, LOCAL settings reset at commit so pooled connections never leak a workspace, and generated suites fail when a new route lacks `TenantGuard` or a new tenant table lacks RLS. Cost: a query outside `withTenant` runs without RLS, so only `listForUser` does that, by design.

## 2026-11-13 · Invite accept: one owner-connection lookup by token hash, then a conditional UPDATE under RLS

- **Decision:** `POST /invites/:token/accept` finds the workspace by `token_hash` without RLS (the second documented cross-tenant read, after `listForUser`), then in one `withTenant` transaction consumes the invite with a conditional `UPDATE ... RETURNING` and inserts the membership (`ON CONFLICT DO NOTHING`; already a member rolls back, so the invite stays usable).
- **Alternatives:** a SECURITY DEFINER SQL function (hides logic in SQL, harder to test); `SELECT ... FOR UPDATE` then `UPDATE` (two statements for the same guarantee).
- **Why:** the only unguarded read filters on a 256-bit secret's hash, and single use is enforced by one statement.

## 2026-11-13 · Student logins: email on `users`, invite-linked activation, OTP and device key

- **Decision:** the student's email lives on the global `users` row (no password). Activation uses a single-use, 72-hour `student_invites` token that names one student record; one transaction then uses up the OTP and the invite, finds or creates the user and links `students.user_id`. Later logins use the email alone. The phone binds an ECDSA P-256 public key (`student_devices`, partial unique on the active user and on the active key). A staff reset revokes the device and all of that user's refresh tokens.
- **Alternatives:** an email column on `students` typed by staff (one login across centers would mean copies that drift, and typos lock the student out); SMS OTP (costs money per message, so it waits for a provider); device fingerprinting instead of a key (can be faked and changes on its own).
- **Why:** one login per child across centers, while each center keeps its own record; staff never handle the email; the private key can't leave the phone, so check-ins (Day 12) prove the phone itself.

## 2026-11-13 · Check-in: derived QR key, MAC then signature, natural idempotency

- **Decision:** the session key is `HMAC(QR_SECRET, "qr:" + sessionId)`, returned by `POST /sessions/:id/open` together with the server time. A code is `sessionId.window.mac16`. `POST /check-ins` checks, in order: the MAC (constant time), the window (current or previous), an ECDSA P-256 signature over the code with the bound device key, the session being open, and the student's record in that workspace (by `user_id`). The status is present or late (after `starts_at` + `settings.lateAfterMinutes`, default 15), or makeup when not enrolled. Repeats rely on the unique (workspace, session, student) key. A manual mark replaces any scan.
- **Alternatives:** a random key stored as `qr_key_encrypted` (more code and key management, the same security); a generic `Idempotency-Key` table (not needed while a natural key exists).
- **Why:** the least moving parts for a hard real-time path. A forged or foreign code is rejected before any database read, and the only cross-workspace read (session by id) happens after a valid MAC.

## 2026-11-13 · Live attendance: SSE read with fetch, in-process bus

- **Decision:** `GET /sessions/:id/live` is Nest `@Sse`: live changes merged with a snapshot (subscribed first, so nothing is lost; the client keeps the newest record per student), plus a 25 s ping. The web reads it with `fetch` and a small parser (`apps/web/src/api/sse.ts`), so the bearer token goes in a header. A guard checks visibility, because an SSE handler's errors arrive after the 200. The bus is an RxJS `Subject` in the API process.
- **Alternatives:** `EventSource` with the token in the query string (it ends up in logs); polling every few seconds (slower, more load); PostgreSQL `LISTEN/NOTIFY` (needed only with more than one API process).
- **Why:** check-ins show up instantly on one free-tier process, with no new infrastructure and no secret in URLs.

## 2026-11-13 · Fees stretch: signed append-only ledger, one monthly fee column, idempotency on the entry

- **Decision:** `ledger_entries` holds signed integer piastres (charge > 0, payment < 0, reversal = −original), with `UPDATE`/`DELETE` revoked from `dafter_app`. The balance is the sum. The fee is `groups.monthly_fee_piastres` (no `fee_plans` table yet); charges are one per student, group and month (`YYYY-MM` in the workspace timezone), created on enroll and by a daily pg-boss job, minus the enrollment discount. `POST /payments` and `POST /ledger/:id/reverse` need an `Idempotency-Key`, stored on the entry with a request hash. Receipt numbers come from a per-workspace counter row, bumped first in the payment transaction.
- **Alternatives:** unsigned amounts with a type (sign logic everywhere); a separate idempotency table (needed only for writes with no entry to hang the key on); a `fee_plans` table (the fee model is still an open question for center interviews); PostgreSQL sequences for receipts (they leave gaps on rollback).
- **Why:** correct money with the least schema, history enforced by the database, and retries that are safe without extra tables. Easy to extend to fee plans once centers answer.
