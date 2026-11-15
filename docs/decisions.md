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

## 2026-11-13 · Day 15: the outbox table is the queue, polled every minute

- **Decision:** session close inserts one `outbox_messages` row per guardian in the close transaction (`INSERT … SELECT … GROUP BY guardian`, unique `dedupe_key`, `ON CONFLICT DO NOTHING`), with a payload snapshot and `send_after` from a SQL quiet-hours function in the workspace timezone. A pg-boss cron job (every minute) takes due rows with `FOR UPDATE SKIP LOCKED`, renders, calls the `MessageProvider`, and stores the body. Failures back off 2^n minutes, then become `failed` after 5 attempts. The fake phone reads sent rows from the database.
- **Alternatives:** a relay that turns each row into a pg-boss job with `startAfter` (two queues to keep in sync, and "written but never enqueued" becomes a new state); sending directly after commit (loses messages on a crash); a Node quiet-hours helper (duplicates the timezone logic the SQL jobs already use).
- **Why:** one source of truth for message state, exactly-once rows by constraint, and no new infrastructure. The cost is up to a minute of delay, which is fine for parent messages.

## 2026-11-13 · Day 16: fixed templates in code, toggles checked on insert, moves keyed by the new time

- **Decision:** `templates.ts` holds one ar/en sentence per trigger (absence, session_cancelled, session_moved), ending in the center's name. `workspaces.settings.messages` has two switches (`absence`, `sessionChange`), default on, checked in the outbox `INSERT … SELECT`. Cancel and move enqueue in the same transaction as the update; a move's `dedupe_key` adds the new start time. The log (`GET /messages`) is for owner and assistant; teachers get 403 because it lists every parent's phone.
- **Alternatives:** editable templates per workspace (WhatsApp needs pre-approved templates, so it would mislead); checking toggles at send time (fills the log with rows that never send); one dedupe key per session for moves (drops the second move); letting teachers see the log for their own groups (more policy code for little v0 value).
- **Why:** the least moving parts that keep "one message per real event" true, and a log that shows only real messages.

## 2026-11-13 · Day 17: one origin through a Cloudflare Pages proxy, migrations at boot

- **Decision:** the web app on Cloudflare Pages forwards `/api/*` and `/health` to Render through one Pages Function (no logic, limited by `_routes.json`), so the browser sees one origin. Render runs `node apps/api/dist/main.js`, which migrates first when `MIGRATE_ON_START=1`; migrations, seeds and pg-boss use Neon's direct URL, the API its pooled URL. Email goes through Brevo's HTTP API (no SDK).
- **Alternatives:** a separate API origin with CORS and `SameSite=None` cookies (iPhone Safari blocks third-party cookies, so users would be signed out); serving the web app from Render (the login page itself waits ~50 s when Render sleeps); a paid domain with subdomains (costs before any paying center); a `pnpm db:migrate` start command (needs pnpm and tsx at runtime).
- **Why:** first-party cookies with no CORS, an instant web app even when the API sleeps, and a start command that is just `node`.

## 2026-11-13 · Day 17b: the API on a Hugging Face Docker Space instead of Render

- **Decision:** the API and worker run on a free Hugging Face Docker Space (CPU basic, 2 vCPU, 16 GB, no card). The Space holds only `infra/hf-space/Dockerfile` and its README; the build clones the public GitHub repo and builds the API, so there is one source of code. Secrets live in the Space settings; the Pages proxy points `API_ORIGIN` at the Space.
- **Alternatives:** Render (needs a card through Stripe, which rejects prepaid and wallet cards); Koyeb (needs a card since February 2026); Railway (a one-time $5 trial, about a month); Neon Functions (no card, but a `fetch` handler, no always-on worker and 10 active hours a month); the laptop behind a Cloudflare Tunnel (only up while it's on).
- **Why:** the only free, card-less host that keeps a long-running Node process (pg-boss worker, SSE). Risks: outgoing port 5432 isn't documented as open (fallback: Neon's port-443 driver), and deploys are a manual Factory rebuild.

## 2026-11-13 · Day 17b (final): Vercel Hobby, serverless, instead of an always-on host

- **Decision:** the web app and the API deploy as one Vercel Hobby project (no card): static files plus one function running the NestJS app. No pg-boss on Vercel: messages are sent right after the write that queued them (`OUTBOX_SEND_INLINE=1`), and `GET /internal/tick` (guarded by `CRON_SECRET`) runs the daily jobs and sends what quiet hours held, from Vercel's daily cron at 08:00 Cairo; an hourly cron-job.org call retries failures. The live list polls the database every second instead of an in-process bus. This replaces the Hugging Face plan above (Docker Spaces became paid) and the Cloudflare Pages proxy (one origin on Vercel).
- **Alternatives:** Render, Koyeb, Fly.io (all need a card); Hugging Face Docker (now paid); Railway (a month-long trial); the laptop behind a tunnel (only up while it's on); a per-minute cron (keeps Neon awake and exceeds its free compute hours).
- **Why:** free with no card and no expiry, one origin without a proxy, and the real client IP for rate limits. The always-on mode (pg-boss, migrations at boot) stays in the code for a VPS. Costs: up to 1 s live delay, cold starts, and Hobby's non-commercial terms.

## 2026-11-15 · v1: exam results as a whole-grid replace, sent through the outbox

- **Decision:** a grade grid is saved with one `PUT` that replaces all results of the exam under a row lock; parents get results only on an explicit "send", as `exam_result` outbox rows keyed by exam, guardian and a hash of that guardian's results.
- **Alternatives:** one request per cell (chatty, half-saved grids on a bad connection); sending on every save (parents get a message per correction); a key with a results revision (allows corrections, but needs a version column and wording for "corrected").
- **Why:** one tap, idempotent, and the same exactly-once machinery as absences; the hash in the key lets a correction reach only the affected parents without a version column.

## 2026-11-15 · v1: fee reminders from the daily job, once a month, off by default

- **Decision:** the daily charges job queues one `fee_overdue` outbox row per guardian from the 7th of the month, keyed by local month and guardian; the switch defaults to off.
- **Alternatives:** a reminder on every charge (parents texted on the 1st before they could pay); a daily reminder (spam); a separate scheduled job (another cron on a free host that allows one a day).
- **Why:** reuses the daily run and the outbox's exactly-once key; off by default because money texts must wait until a center trusts its records.

## 2026-11-15 · v1: rooms enforced by an exclusion constraint on sessions

- **Decision:** `rooms` per workspace; the room sits on the group and is copied onto each generated session; `sessions_room_no_overlap` (btree_gist, non-cancelled sessions with a room) is the backstop; the API checks a group's weekly slots against the room's other active groups under a row lock on the room and returns `ROOM_BOOKED` with the clash.
- **Alternatives:** an API-only check (races, and every future write path must remember it); the constraint only (no friendly error naming the slot, and it fires per session, not per weekly slot); the room on groups only (a moved or past session couldn't keep its own room).
- **Why:** the database guarantees the rule under concurrency; the API gives the translated message; a session generated over a moved session gets no room instead of failing the whole job.

## 2026-11-15 · v1: editable message templates in workspace settings, filled at send time

- **Decision:** a center's wording per trigger and language lives in `workspaces.settings.templates` (null = default); the defaults, the placeholder lists and `fillTemplate` are in `packages/contracts`; the sender fills the text at send time; unknown placeholders are refused on save (`TEMPLATE_PLACEHOLDER_UNKNOWN`).
- **Alternatives:** a `message_templates` table (a migration, RLS and a join for ten strings per center); rendering when the message is queued (an edit would never reach messages already waiting); free text without placeholders (the center would type each name).
- **Why:** no migration, one read per send pass, a preview that matches the sent text, and stored bodies keep the log honest.

## 2026-11-15 · v1: re-check outbox rows at send time, keep them as `skipped`

- **Decision:** the sender re-reads the facts a message states (trigger switch, balances, absences) on the locked row just before the provider call, rewrites the payload or marks the row `skipped` with a reason.
- **Alternatives:** delete or update queued rows from every write that could make them stale (payments, reversals, attendance edits, settings); delete the row instead of `skipped` (the dedupe key would free up and a rerun could queue it again).
- **Why:** one place knows the rules, quiet-hour rows are covered, and the log shows why a message never went out.

## 2026-11-15 · v1: a request transaction for tenant writes (audit in the same commit)

- **Decision:** the audit interceptor opens one transaction per tenant write request and stores it in `AsyncLocalStorage`; `inTenant` joins it as a savepoint; the audit row is inserted last; after-commit work (the inline outbox flush) waits for the commit.
- **Alternatives:** pass a `tx` through every service and repository (every signature changes); write the audit row inside each feature's transaction by hand (easy to forget on a new endpoint); keep the separate audit transaction (a failed audit row leaves an unrecorded write).
- **Why:** one place, no call-site changes, and savepoints keep each repository block's own rollback (payment repeats, constraint errors mapped to codes). Cost: locks are held to the end of the request, and handlers must not run repository calls in parallel.

## 2026-11-15 · v1: removed members are a status, not a deleted row

- **Decision:** `memberships.status = removed`; every membership lookup reads active rows; no refresh-token revocation.
- **Alternatives:** delete the row (groups, sessions and the audit log point at it); revoke the person's refresh tokens (signs them out of every other center too).
- **Why:** history stays intact, the tenant guard already checks membership per request, so access ends on the next request.

