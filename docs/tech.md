# Tech

How Dafter is built: architecture and stack, the data model and API, bilingual and messaging, testing and CI, and the decision records.

## Contents

1. [Architecture & stack](#architecture) (was `docs/architecture.md`)
2. [Data model & API](#data-model-api) (was `docs/data-model-api.md`)
3. [Bilingual & messaging](#bilingual-messaging) (was `docs/bilingual-messaging.md`)
4. [Testing & CI/CD](#testing-ci) (was `docs/testing-ci.md`)
5. [Decisions](#decisions) (was `docs/decisions.md`)

<a id="architecture"></a>

## Architecture & stack

Dafter is one TypeScript monorepo where a single set of Zod schemas drives backend validation, the OpenAPI spec, the generated RTK Query hooks, and the React Hook Form rules, so the frontend and backend cannot drift apart.

*(Diagram in the plan doc: system architecture · 7 parts on one VPS.)*

The browser only ever talks to the API through Caddy; anything slow or retryable, like sending a WhatsApp message, goes through a pg-boss job queue inside PostgreSQL to the worker, and provider delivery webhooks come back into the API.

### Stack

| Layer | Choice | Why this one |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | One install, cached builds, run only the tests a change affects |
| Language | TypeScript (strict) everywhere | Shared types from database to UI |
| API framework | NestJS on the Fastify adapter | Modules, guards and DI fit role-based multi-tenant rules; common in Egyptian job posts |
| Contracts | Zod schemas in `packages/contracts` | One schema validates the API request and the React form |
| API docs | OpenAPI 3.1 generated from Zod, served with Scalar | Live docs to link in your README |
| Database | PostgreSQL 17 | Money and attendance need constraints, transactions and row-level security |
| ORM and migrations | Drizzle ORM + drizzle-kit | Close to SQL, fully typed, easy to combine with raw SQL and RLS |
| Background jobs | pg-boss on PostgreSQL | Retries with backoff, delayed jobs for quiet hours, scheduled jobs, with no extra service, so it runs on free tiers too |
| Cache and rate limits | Cache in process; rate limits in a PostgreSQL table (`rate_limits`, one upsert per hit). Redis only at the VPS stage, once there are several API replicas and the queries show | No extra service to run or pay for; limits survive restarts and serverless instances share them |
| Auth | Built in-house: argon2id, 15-minute JWT access token, rotating refresh token in an httpOnly cookie | Shows you understand auth instead of renting it |
| Frontend | React 19, Vite, React Router, Redux Toolkit + RTK Query, React Hook Form, vite-plugin-pwa for the installable student app | Your current stack, so you move fast |
| UI and RTL | Tailwind CSS v4 with logical properties, shadcn/ui on Radix | Radix supports `dir="rtl"`; logical classes flip automatically |
| i18n | react-i18next with ICU messages | Arabic needs six plural forms; ICU handles them |
| QR | Rotating session QR (an HMAC per 10-second window) drawn on the teacher's screen; students scan with a zxing-based scanner; check-ins are signed by a non-extractable WebCrypto device key | A forwarded photo expires in seconds, and one phone serves only one account |
| PDFs (receipts) | Print-ready HTML pages that the browser saves as PDF | The browser shapes Arabic perfectly, and the server never runs Chromium |
| Messaging | Provider adapters: WhatsApp Cloud API, SMS, email for login codes, and a dev console adapter | Swap providers without touching business logic |
| Logs | pino JSON logs with request ID and workspace ID | Trace one request across API and worker |
| Hosting | Free tiers for the demo; from the first paying customer, Docker Compose on one VPS with Caddy for automatic HTTPS and images in GitHub Container Registry (see operations.md#hosting-saas) | A real deployment you control, not a managed backend |
| Backups | From the VPS stage: nightly `pg_dump` to S3-compatible storage, plus continuous WAL archiving with pgBackRest, restore tested monthly | Money data must be recoverable |

**Why Vite, not Next.js.** NestJS is already the backend, so Next's API routes and server actions would duplicate it. Everything sits behind a login, so server rendering and SEO add nothing. A Vite build is static files on Cloudflare Pages, and `vite-plugin-pwa` makes the student app installable with little setup. A public landing page for selling Dafter, where SEO does matter, can be a small separate site later (Astro or Next), outside this app.

### How the pieces stay in sync

1. A Zod schema in `packages/contracts` defines every request, response and error code.
2. NestJS validates incoming requests and outgoing responses against that schema.
3. A build step writes `openapi.json` from the schemas.
4. RTK Query codegen turns `openapi.json` into typed hooks inside the web app.
5. Forms import the same schema through `zodResolver`, so the browser rejects bad input with the same rules as the server.
6. CI regenerates the spec and the client and fails if the committed files differ, and `oasdiff` flags any breaking API change.
7. The API returns error codes, never sentences; the web app translates each code into Arabic or English.

### Repository layout

```
dafter/
  apps/
    api/          NestJS app; one codebase, two entry points
      main.ts       HTTP server
      worker.ts     pg-boss workers (messages, session generation)
    web/          React + Vite app (staff at /app, students at /s, installable PWA)
  packages/
    contracts/    Zod schemas, error codes, OpenAPI generator
    db/           Drizzle schema, migrations, RLS policies, seed data
    i18n/         Shared locale keys and message templates (ar, en)
    config/       Shared tsconfig, ESLint, Prettier
  e2e/            Playwright tests
  infra/          docker-compose files, Caddyfile, backup scripts
  docs/           This plan, progress.md, decisions
  .claude/skills/ Project skills that Claude Code loads automatically
  CLAUDE.md       Build instructions for Claude Code
```

### Multi-tenancy

Every tenant-owned table has a `workspace_id` column, and isolation is enforced in three layers.

1. **Guard.** Each request carries the selected workspace. A NestJS guard checks that the user has a membership there and loads their role and scope.
2. **Repository.** Every query is built through a tenant-scoped repository that always adds the workspace filter.
3. **Database.** Each request runs in a transaction that sets `app.workspace_id`, and PostgreSQL row-level security policies refuse rows from any other workspace. If layer 2 has a bug, layer 3 still blocks the leak.

An assistant's narrower scope (only some teachers' groups) is checked in the service layer with a policy function per resource, and covered by tests.

### Auth

- Passwords hashed with argon2id; login rate-limited per phone number and per IP.
- Access token: JWT, 15 minutes, kept in memory in the browser.
- Refresh token: random, stored hashed in the database, sent as an httpOnly, Secure, SameSite cookie, rotated on every use.
- Reuse detection: if an old refresh token is used again, the whole token family is revoked and the user must log in again.
- Invites: single-use signed links that expire after 72 hours.
- Students sign in without a password: a 6-digit one-time code by email (v0) or WhatsApp (later), valid 5 minutes, stored hashed, 5 attempts, rate-limited per phone or email.
- A student's session works only from their bound phone. An assistant can reset the binding when the student changes phones, and the reset is audited.

### Built for speed and traffic

Session start is where latency hurts most, so the teacher's screen draws the QR locally and a check-in is a single fast request; everything else is kept fast with caching, indexes, and moving slow work off the request path. This section is the v1.0 target: v0 ships rotating-QR check-in on the free tier, and the server-side items below arrive at the VPS stage, when monitoring shows a need.

**Rotating QR check-in**

1. Opening a session gives the teacher's device a per-session secret and the server's time. The screen then draws a new QR every 10 seconds, locally: the code holds the session ID, the 10-second window number, and an HMAC of both.
2. On first login, the student's phone creates a non-extractable WebCrypto key pair and sends the public key, which the server binds to the account. The private key never leaves that phone and cannot be copied to another.
3. A check-in sends the scanned code plus a signature from the device key. The server accepts it only if the window is the current or previous one (about 20 seconds), the key is the account's bound key, and the student is enrolled in the group (or it counts as a make-up).
4. A unique key on session and student makes repeated scans harmless. The response comes back in one round trip, and the check-in is pushed to the teacher's live list over server-sent events.
5. Limits worth knowing: binding stops one phone from checking in several accounts, and rotation makes a forwarded photo expire, but a student on a live video call could still scan in time. Location checks are a later upgrade.

**The student app is a PWA.** Students install Dafter to their home screen from a link, with no app store. It opens full screen with its own Arabic name and icon, and asks the browser for persistent storage so the bound key is not cleared. Activation always runs inside the installed app: invite link, install, log in with the one-time code, bind the phone. This matters on iPhone, where the installed app and Safari have separate storage and Safari may clear a website's data after about 7 days without visits. Camera scanning works in installed PWAs on Android and iPhone. A native app (React Native) stays a later option.

**Fast everywhere else**

- Optimistic updates in RTK Query for safe actions such as attendance and edits. Money writes wait for the server but show a pending state at once, and the idempotency key stops a retry from charging twice.
- RTK Query cache tags on the client, ETags on rosters and lists, and an in-process cache for hot reads (Redis once there are several API replicas), cleared on every write to that workspace.
- Every composite index starts with `workspace_id`; names use a trigram index. Any query slower than 100 ms is logged and reviewed every sprint, and a PR that adds a query includes its `EXPLAIN`.
- PgBouncer pools database connections so traffic spikes do not exhaust PostgreSQL.

**Zero-downtime deploys**

Two API replicas restart one at a time behind Caddy's health checks. Each replica stops taking requests and finishes the ones in flight before it exits. Migrations are always backward-compatible with the running version.

**Seeing problems before users do**

- Prometheus metrics from the API and worker: p95 latency, error rate, queue depth, failed messages.
- A Grafana dashboard and alerts to Telegram when a budget from the Product tab is broken.
- An external uptime check from a second, cheap server, so an outage of the main server is still reported.

**Scaling path**

| Stage | Trigger | Change |
| --- | --- | --- |
| 1. One server | MVP and pilot | Everything on one 4 vCPU / 8 GB VPS, 2 API replicas |
| 2. Split | Nightly k6 shows CPU above 60% at target load | PostgreSQL and the worker move to their own servers; 3 to 4 API replicas |
| 3. Grow | Reports slow down daily work | A read replica for reports and exports; static files on a CDN; partition `attendance_records` by month |

The API keeps no state in memory, so stage 2 and 3 need no code changes, only infrastructure.

<a id="data-model-api"></a>

> **Status (Nov 19):** this is the original plan. What was built differs in places (no `fee_plans` or `message_templates` tables, templates live in `workspaces.settings`, extra tables such as `rooms`, `password_resets`, `rate_limits`); the migrations in `packages/db` and the [Decisions](#decisions) part below are the source of truth.

## Data model & API

The database has about 20 tables in five areas, and every table except the identity tables carries `workspace_id`. Money is stored as integer piastres, and every financial change is an append-only entry.

### Tables

| Area | Table | Key columns | Notes |
| --- | --- | --- | --- |
| Identity | users | id, name, phone, email, password_hash, locale | Global, not per workspace |
| Identity | refresh_tokens | id, user_id, family_id, token_hash, expires_at, revoked_at | Rotation and reuse detection |
| Tenancy | workspaces | id, type (center, independent), name_ar, name_en, timezone, settings | Timezone defaults to Africa/Cairo |
| Tenancy | memberships | user_id, workspace_id, role (owner, teacher, assistant) | Unique per user and workspace |
| Tenancy | assistant_scopes | membership_id, teacher_membership_id | Which teachers an assistant works for |
| Tenancy | invites | id, workspace_id, role, token_hash, expires_at, used_at | Single use |
| Teaching | rooms | id, name, capacity | Centers only |
| Teaching | subjects, grade_levels | id, name_ar, name_en | Seeded with the Egyptian curriculum; editable |
| Teaching | groups | id, teacher_membership_id, subject_id, grade_level_id, room_id, capacity, fee_plan_id, status | |
| Teaching | group_slots | group_id, weekday, start_time, end_time | Source for generating sessions |
| Teaching | sessions | id, group_id, room_id, starts_at, ends_at, status (scheduled, open, closed, cancelled), closed_by, qr_key_encrypted | Generated 4 weeks ahead |
| Students | students | id, name_ar, name_en, phone, grade_level_id, school, user_id (set when the student activates the app), name_search | `name_search` is the normalized Arabic name, indexed with pg_trgm |
| Students | guardians | id, name, phone, relation, preferred_locale, whatsapp_opt_in | One guardian can have many students |
| Students | student_guardians | student_id, guardian_id, is_primary | Lets siblings share a parent |
| Students | enrollments | student_id, group_id, discount_pct, status, joined_at, left_at | |
| Attendance | attendance_records | session_id, student_id, status (present, late, absent, excused, makeup), method (student_scan, manual, auto_close), recorded_by, scanned_at, device_id, qr_window | Unique on session and student, which makes repeated scans harmless; `device_id` and `qr_window` record how the check-in was proven |
| Money | fee_plans | id, type (monthly, per_session, package), amount_piastres, sessions_in_package | |
| Money | ledger_entries | id, student_id, group_id, type (charge, payment, discount, reversal), amount_piastres, method, receipt_no, reverses_entry_id, created_by | Append-only; the balance is the sum of entries |
| Exams | exams, exam_results | exam: group_id, title, max_score, held_on; result: exam_id, student_id, score, absent | Score checked against max_score |
| Messaging | message_templates | workspace_id, trigger, locale, body, enabled | Per trigger and per language |
| Messaging | outbox_messages | id, guardian_id, trigger, payload, dedupe_key, status, attempts, send_after, provider_message_id | Written in the same transaction as the event |
| Audit | audit_log | actor_id, action, entity, entity_id, before, after, at | Every write |

### Design rules

- **Money in piastres.** `amount_piastres` is a 64-bit integer, so 150.50 EGP is stored as 15050. No floating point anywhere near money.
- **Ledger, not a balance column.** A student's balance is computed from `ledger_entries`; a nightly check compares it with a cached value and alerts on any difference.
- **Time.** All timestamps are `timestamptz` in UTC; the workspace timezone is applied only for display and for generating sessions.
- **No hard deletes** for students, payments or attendance. Students are archived; payments are reversed.
- **Idempotency.** Every write that a phone may retry (scans, payments) accepts an `Idempotency-Key` header; repeats return the first result.
- **Jobs live in PostgreSQL.** pg-boss keeps its queue in its own `pgboss` schema, outside RLS, so every job payload carries its `workspace_id` and the worker sets it before touching tenant tables.
- **SaaS tables come later.** `plans` and `subscriptions` (see operations.md#hosting-saas) are added before the first paying center, not in v0.
- **Student accounts.** Two identity tables support them: `otp_codes` (id, channel, destination, code_hash, expires_at, attempts, consumed_at) and `student_devices` (id, user_id, public_key, label, bound_at, revoked_at, revoked_by), with at most one active device per user and one user per device key.

### API

REST over JSON under `/api/v1`. The selected workspace goes in the `X-Workspace-Id` header. Lists use cursor pagination. Errors follow one shape: `{ code, details }`, where `code` is a key such as `ATTENDANCE_ALREADY_RECORDED` that the web app translates.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me` |
| Workspaces | `POST /workspaces`, `GET /workspaces`, `POST /invites`, `POST /invites/:token/accept`, `GET /members`, `PATCH /members/:id` |
| Groups | `GET /groups`, `POST /groups`, `PATCH /groups/:id`, `GET /groups/:id/sessions` |
| Sessions | `GET /sessions?date=today`, `POST /sessions/:id/open`, `POST /sessions/:id/close`, `POST /sessions/:id/cancel`, `PATCH /sessions/:id` (move) |
| Students | `GET /students?q=`, `POST /students`, `PATCH /students/:id`, `POST /students/:id/enrollments`, `GET /students/:id/invite` |
| Attendance | `POST /check-ins` (student: scanned code + device signature), `GET /sessions/:id/live` (teacher, server-sent events), `DELETE /students/:id/device` (assistant reset), `PUT /sessions/:id/attendance/:studentId` (manual) |
| Money | `GET /students/:id/ledger`, `POST /payments`, `POST /ledger/:id/reverse`, `GET /reports/unpaid`, `GET /reports/cash-summary?date=` |
| Exams | `POST /groups/:id/exams`, `PUT /exams/:id/results` (bulk), `POST /exams/:id/notify` |
| Messaging | `GET /message-templates`, `PUT /message-templates/:trigger/:locale`, `GET /messages?status=` |
| Dashboard | `GET /dashboard/today` |

**Student app endpoints:** `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /devices/bind`, `GET /me/schedule`, `GET /me/attendance`, and `POST /check-ins`. They are scoped to the signed-in student's own records across all their workspaces.

<a id="bilingual-messaging"></a>

## Bilingual & messaging

Arabic is the default language and the layout is designed RTL-first; English is a full second language, not an afterthought. Parent messages are sent through a transactional outbox, so one event produces exactly one message even when buttons are double-pressed or the server restarts.

### Arabic and English

**Two separate language settings.** Each user picks the language of the app. Each guardian has their own preferred language for messages. An English-speaking teacher can work in English while parents get Arabic.

**Layout**

- The app sets `<html lang dir>` from the locale; every component reads direction from there.
- Tailwind logical classes only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`); an ESLint rule bans `ml-`, `mr-`, `left-`, `right-`.
- Arrows and chevrons flip with the `rtl:` variant; logos and media controls do not.
- Phone numbers, receipt numbers and codes stay left-to-right inside Arabic text, wrapped in `<bdi>`.
- One font family with both scripts, for example IBM Plex Sans Arabic, so mixed lines align.

**Formatting**

- Numbers: Western digits by default, with a workspace setting for Arabic-Indic digits. Use `ar-EG-u-nu-latn` with `Intl.NumberFormat` to keep Western digits, because plain `ar-EG` switches to ٠١٢.
- Money: "150 ج.م" in Arabic, "EGP 150" in English.
- Dates: `Intl.DateTimeFormat` with the user's locale; weeks start on Saturday.
- Plurals: ICU messages. Arabic has six plural forms (zero, one, two, few, many, other), so "3 طلاب" and "11 طالبًا" come out right.

**Bilingual data.** Workspace, subject and grade-level names have `_ar` and `_en` columns. Student names are entered in Arabic; the English name is optional.

**Arabic name search.** One shared normalize function runs on save (into `name_search`) and on every search query:

1. Remove diacritics (تشكيل) and the tatweel character.
2. Map أ إ آ to ا, ة to ه, ى to ي.
3. Collapse spaces, then match with `pg_trgm` so small typos still find the student.

**Translation files.** Keys live in `packages/i18n/locales/{ar,en}/*.json`. TypeScript types are generated from the Arabic file, so a missing key is a compile error, and CI checks that both languages have the same keys. A lint rule blocks hard-coded strings in JSX.

### Parent messaging

| Trigger | Sent when | Default | Example (Arabic) |
| --- | --- | --- | --- |
| Absence | A session is closed and the student did not attend | On | غاب أحمد عن حصة الفيزياء اليوم الساعة 5:00 م — سنتر النور |
| Session cancelled | A session is cancelled or moved | On | تم تأجيل حصة الفيزياء إلى الخميس 6:00 م |
| Fee overdue | A charge is unpaid 7 days after its due date, at most once a week | Off | متبقي من مصاريف شهر نوفمبر 200 ج.م |
| Exam result | A teacher presses "send results" for an exam | On | حصل أحمد على 18 من 20 في اختبار الفصل الأول |

**Pipeline**

1. The business action (for example, closing a session) writes its attendance rows and its `outbox_messages` rows in the same database transaction. If the transaction fails, no message exists.
2. Each outbox row has a unique `dedupe_key`, such as `absence:<session>:<guardian>`. A second close cannot insert a second row, and siblings collapse into one message for their shared guardian.
3. A relay picks up new rows and creates a pg-boss job. During quiet hours (10 PM to 8 AM, Cairo time) `send_after` delays the job to the morning.
4. The worker renders the template in the guardian's language and calls the provider adapter.
5. Failures retry with exponential backoff, up to 5 attempts, then the message is marked failed and shown in the message log.
6. Provider webhooks update the status to sent, delivered, read or failed.

**Providers**

- **WhatsApp Cloud API** is the main channel, since that is where Egyptian parents are. Business-started messages must use templates pre-approved by Meta and are charged per message, so v1 uses fixed approved templates with variables, and workspaces edit only the wording of the SMS and console versions.
- **SMS** through an Egyptian gateway as a fallback for guardians without WhatsApp.
- **Console adapter** for development and demos: messages appear on a "fake phone" page inside the app, so you can record a demo video without paying for messages.
- Guardian consent is recorded (`whatsapp_opt_in`) before any WhatsApp message is sent.
- **v0 (November 30)** sends parent messages only through the console adapter (absence and session cancelled), and student login codes by email (console in development, a free-tier email service on the demo). WhatsApp for parents and login codes, SMS, and the fee and exam triggers come after v0.

<a id="testing-ci"></a>

> **Status (Nov 19):** no staging server yet. `main` deploys to Vercel; CI runs lint, typecheck, unit and integration tests at 100% line coverage, the contract check with `oasdiff`, Playwright e2e, and a `migrate` job that applies migrations to Neon (see `operations.md` → Deploying the free demo). The release pipeline below starts at the VPS stage.

## Testing & CI/CD

Every pull request runs seven automated checks, from type-checking to end-to-end tests in both languages, and nothing reaches production without passing them on staging first. Target: a full PR run in under 10 minutes.

### Test layers

| Layer | Tools | What it proves | When it runs |
| --- | --- | --- | --- |
| Static checks | TypeScript strict, ESLint, Prettier, i18n key check | Types line up across API, contracts and web; no missing translations; no hard-coded text | Pre-commit on staged files (lefthook) and every PR |
| Unit | Vitest | Pure logic: Arabic name normalizing, balance from ledger, generating sessions from slots, quiet hours, permission policies | Every PR, only affected packages |
| API integration | Vitest + Testcontainers (real PostgreSQL 17) + Fastify `inject` | Each endpoint: success, validation errors, permissions, database constraints, migrations from zero | Every PR |
| Tenant isolation | A generated suite over every endpoint | A user from workspace B gets 404 on every workspace A resource; a raw SQL query without the workspace setting returns zero rows (RLS works) | Every PR, never skipped |
| Contract | OpenAPI regeneration + `oasdiff` | The committed spec and generated client match the code; breaking API changes are flagged | Every PR |
| Frontend components | Vitest + React Testing Library + MSW | Forms, the scanner screen and tables behave correctly, rendered in both Arabic and English | Every PR |
| End-to-end | Playwright on the full Docker Compose stack, console message adapter, axe | The acceptance criteria in the Product tab, in Arabic (RTL) and English; no accessibility violations on key pages | Smoke set on every PR; full set nightly and before every release |
| Performance and load | k6 on the API, Lighthouse CI on the web app | The budgets in the Product tab hold: 50 scans per second, p95 latency, bundle size, and first load, with no errors or duplicates | Lighthouse CI on every PR; k6 before each release (nightly only from the VPS stage); a broken budget blocks the next release |

### Making tests reliable

- **One database container per run.** Each test worker clones a migrated template database (`CREATE DATABASE … TEMPLATE`), so tests run in parallel without sharing state.
- **Controlled time.** A `Clock` service is injected everywhere; tests set the time to check quiet hours, due dates and session generation.
- **Factories and seed.** Test factories build valid students, groups and ledgers in one line. The seed script creates a demo center with realistic Arabic names for local work and for the live demo.
- **No real messages in tests.** The console adapter records every message, and tests assert on what it received.
- **Coverage where it matters.** Coverage is reported for all packages, with an 80% floor enforced only on the domain services (attendance, money, messaging).

### Critical end-to-end scenarios

1. Owner signs up, creates a center, invites an assistant, and the assistant joins with the right scope.
2. Teacher creates a group with two weekly slots; four weeks of sessions appear.
3. Assistant registers and enrolls a student; the student activates the app with an email code on a phone-sized browser and the phone is bound to the account.
4. Teacher opens a session; 5 students check in by scanning the rotating QR (one scans twice, one uses a 30-second-old code and is rejected, one tries from a second phone and is rejected); the assistant ticks one phoneless student; the teacher closes the session; everyone else is absent and exactly one absence message per guardian is queued.
5. A payment is recorded, reversed, and recorded again; the balance and the cash summary are correct.
6. Teacher enters exam scores, one above the maximum is rejected, and results are sent.
7. A user in two workspaces switches between them and never sees the other's data.

Scenario 4 runs with two browser contexts (teacher screen and student phone) and fake time, and again on a throttled network to prove a slow check-in still counts once.

### Pull request pipeline (`ci.yml`)

1. Install with pnpm and restore the Turborepo cache.
2. In parallel: lint, type-check, format check, i18n key check.
3. Unit and component tests for affected packages.
4. API integration and tenant isolation tests against Testcontainers.
5. Contract check: regenerate the spec and client, fail on any diff, run `oasdiff`.
6. Build the Docker images.
7. Start the stack with Docker Compose and run the Playwright smoke set; upload the report and traces when anything fails.

Branch protection on `main` requires all seven to pass. Commits follow Conventional Commits, and PRs are squash-merged.

### Release pipeline (`deploy.yml`, on merge to `main`)

1. Build images tagged with the commit SHA and push them to GitHub Container Registry.
2. Deploy to staging (same VPS, separate Compose project, `staging.` subdomain).
3. Run migrations as a one-off container. Migrations are backward-compatible (add first, remove later), so the previous version keeps working during the deploy.
4. Run the Playwright smoke set against staging.
5. A manual approval in a GitHub environment promotes the same SHA to production.
6. A health check runs after the switch; if it fails, the previous SHA is redeployed automatically.

**Until the VPS stage (including v0):** there is no staging server. Render and Cloudflare Pages deploy `main` automatically, migrations run when the API starts, and the Playwright smoke set runs against the live demo URL after each deploy. The release pipeline above starts with the first paying center.

**Scheduled jobs:** the full end-to-end suite every night, Renovate dependency updates every week, and a backup restore test every month.

### Local development

- `pnpm dev` starts PostgreSQL in Docker, then the API, worker and web app with hot reload.
- `pnpm db:reset` drops, migrates and seeds the database.
- `pnpm test` runs everything CI runs except end-to-end; `pnpm e2e` runs Playwright locally with the UI mode.

<a id="decisions"></a>

## Decisions

Short records of design choices: decision, alternatives, why.

### 2026-11-13 · Staff auth: short JWT + rotating refresh token with family reuse detection

- **Decision:** 15-minute HS256 access JWT kept in memory; 256-bit random refresh token in an httpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`, stored as a SHA-256 hash, rotated on every refresh inside a `FOR UPDATE` transaction; a revoked token coming back revokes its whole family.
- **Alternatives:** a long-lived JWT in localStorage (cannot be revoked, readable by any XSS); server-side sessions (a database read on every request).
- **Why:** only `/auth/refresh` touches the database, a stolen refresh token works at most once before reuse is detected, and logout really ends the session. Cost: two tabs refreshing at the same moment look like reuse and sign the user out.

### 2026-11-13 · Tenant isolation: `SET LOCAL ROLE dafter_app` per tenant transaction, RLS as backstop

- **Decision:** the API connects as the table owner; every tenant query goes through `withTenant`, which starts a transaction with `SET LOCAL ROLE dafter_app` (NOLOGIN, NOBYPASSRLS) and `set_config('app.workspace_id', id, true)`. Policies compare `workspace_id` with that setting; unset means no rows.
- **Alternatives:** `FORCE ROW LEVEL SECURITY` on the owner (superusers skip RLS anyway, so it would silently do nothing in local dev and tests); a separate login role with its own `DATABASE_URL` (same guarantee, two secrets on every host).
- **Why:** one connection string, LOCAL settings reset at commit so pooled connections never leak a workspace, and generated suites fail when a new route lacks `TenantGuard` or a new tenant table lacks RLS. Cost: a query outside `withTenant` runs without RLS, so only `listForUser` does that, by design.

### 2026-11-13 · Invite accept: one owner-connection lookup by token hash, then a conditional UPDATE under RLS

- **Decision:** `POST /invites/:token/accept` finds the workspace by `token_hash` without RLS (the second documented cross-tenant read, after `listForUser`), then in one `withTenant` transaction consumes the invite with a conditional `UPDATE ... RETURNING` and inserts the membership (`ON CONFLICT DO NOTHING`; already a member rolls back, so the invite stays usable).
- **Alternatives:** a SECURITY DEFINER SQL function (hides logic in SQL, harder to test); `SELECT ... FOR UPDATE` then `UPDATE` (two statements for the same guarantee).
- **Why:** the only unguarded read filters on a 256-bit secret's hash, and single use is enforced by one statement.

### 2026-11-13 · Student logins: email on `users`, invite-linked activation, OTP and device key

- **Decision:** the student's email lives on the global `users` row (no password). Activation uses a single-use, 72-hour `student_invites` token that names one student record; one transaction then uses up the OTP and the invite, finds or creates the user and links `students.user_id`. Later logins use the email alone. The phone binds an ECDSA P-256 public key (`student_devices`, partial unique on the active user and on the active key). A staff reset revokes the device and all of that user's refresh tokens.
- **Alternatives:** an email column on `students` typed by staff (one login across centers would mean copies that drift, and typos lock the student out); SMS OTP (costs money per message, so it waits for a provider); device fingerprinting instead of a key (can be faked and changes on its own).
- **Why:** one login per child across centers, while each center keeps its own record; staff never handle the email; the private key can't leave the phone, so check-ins (Day 12) prove the phone itself.

### 2026-11-13 · Check-in: derived QR key, MAC then signature, natural idempotency

- **Decision:** the session key is `HMAC(QR_SECRET, "qr:" + sessionId)`, returned by `POST /sessions/:id/open` together with the server time. A code is `sessionId.window.mac16`. `POST /check-ins` checks, in order: the MAC (constant time), the window (current or previous), an ECDSA P-256 signature over the code with the bound device key, the session being open, and the student's record in that workspace (by `user_id`). The status is present or late (after `starts_at` + `settings.lateAfterMinutes`, default 15), or makeup when not enrolled. Repeats rely on the unique (workspace, session, student) key. A manual mark replaces any scan.
- **Alternatives:** a random key stored as `qr_key_encrypted` (more code and key management, the same security); a generic `Idempotency-Key` table (not needed while a natural key exists).
- **Why:** the least moving parts for a hard real-time path. A forged or foreign code is rejected before any database read, and the only cross-workspace read (session by id) happens after a valid MAC.

### 2026-11-13 · Live attendance: SSE read with fetch, in-process bus

- **Decision:** `GET /sessions/:id/live` is Nest `@Sse`: live changes merged with a snapshot (subscribed first, so nothing is lost; the client keeps the newest record per student), plus a 25 s ping. The web reads it with `fetch` and a small parser (`apps/web/src/api/sse.ts`), so the bearer token goes in a header. A guard checks visibility, because an SSE handler's errors arrive after the 200. The bus is an RxJS `Subject` in the API process.
- **Alternatives:** `EventSource` with the token in the query string (it ends up in logs); polling every few seconds (slower, more load); PostgreSQL `LISTEN/NOTIFY` (needed only with more than one API process).
- **Why:** check-ins show up instantly on one free-tier process, with no new infrastructure and no secret in URLs.

### 2026-11-13 · Fees stretch: signed append-only ledger, one monthly fee column, idempotency on the entry

- **Decision:** `ledger_entries` holds signed integer piastres (charge > 0, payment < 0, reversal = −original), with `UPDATE`/`DELETE` revoked from `dafter_app`. The balance is the sum. The fee is `groups.monthly_fee_piastres` (no `fee_plans` table yet); charges are one per student, group and month (`YYYY-MM` in the workspace timezone), created on enroll and by a daily pg-boss job, minus the enrollment discount. `POST /payments` and `POST /ledger/:id/reverse` need an `Idempotency-Key`, stored on the entry with a request hash. Receipt numbers come from a per-workspace counter row, bumped first in the payment transaction.
- **Alternatives:** unsigned amounts with a type (sign logic everywhere); a separate idempotency table (needed only for writes with no entry to hang the key on); a `fee_plans` table (the fee model is still an open question for center interviews); PostgreSQL sequences for receipts (they leave gaps on rollback).
- **Why:** correct money with the least schema, history enforced by the database, and retries that are safe without extra tables. Easy to extend to fee plans once centers answer.

### 2026-11-13 · Day 15: the outbox table is the queue, polled every minute

- **Decision:** session close inserts one `outbox_messages` row per guardian in the close transaction (`INSERT … SELECT … GROUP BY guardian`, unique `dedupe_key`, `ON CONFLICT DO NOTHING`), with a payload snapshot and `send_after` from a SQL quiet-hours function in the workspace timezone. A pg-boss cron job (every minute) takes due rows with `FOR UPDATE SKIP LOCKED`, renders, calls the `MessageProvider`, and stores the body. Failures back off 2^n minutes, then become `failed` after 5 attempts. The fake phone reads sent rows from the database.
- **Alternatives:** a relay that turns each row into a pg-boss job with `startAfter` (two queues to keep in sync, and "written but never enqueued" becomes a new state); sending directly after commit (loses messages on a crash); a Node quiet-hours helper (duplicates the timezone logic the SQL jobs already use).
- **Why:** one source of truth for message state, exactly-once rows by constraint, and no new infrastructure. The cost is up to a minute of delay, which is fine for parent messages.

### 2026-11-13 · Day 16: fixed templates in code, toggles checked on insert, moves keyed by the new time

- **Decision:** `templates.ts` holds one ar/en sentence per trigger (absence, session_cancelled, session_moved), ending in the center's name. `workspaces.settings.messages` has two switches (`absence`, `sessionChange`), default on, checked in the outbox `INSERT … SELECT`. Cancel and move enqueue in the same transaction as the update; a move's `dedupe_key` adds the new start time. The log (`GET /messages`) is for owner and assistant; teachers get 403 because it lists every parent's phone.
- **Alternatives:** editable templates per workspace (WhatsApp needs pre-approved templates, so it would mislead); checking toggles at send time (fills the log with rows that never send); one dedupe key per session for moves (drops the second move); letting teachers see the log for their own groups (more policy code for little v0 value).
- **Why:** the least moving parts that keep "one message per real event" true, and a log that shows only real messages.

### 2026-11-13 · Day 17: one origin through a Cloudflare Pages proxy, migrations at boot

- **Decision:** the web app on Cloudflare Pages forwards `/api/*` and `/health` to Render through one Pages Function (no logic, limited by `_routes.json`), so the browser sees one origin. Render runs `node apps/api/dist/main.js`, which migrates first when `MIGRATE_ON_START=1`; migrations, seeds and pg-boss use Neon's direct URL, the API its pooled URL. Email goes through Brevo's HTTP API (no SDK).
- **Alternatives:** a separate API origin with CORS and `SameSite=None` cookies (iPhone Safari blocks third-party cookies, so users would be signed out); serving the web app from Render (the login page itself waits ~50 s when Render sleeps); a paid domain with subdomains (costs before any paying center); a `pnpm db:migrate` start command (needs pnpm and tsx at runtime).
- **Why:** first-party cookies with no CORS, an instant web app even when the API sleeps, and a start command that is just `node`.

### 2026-11-13 · Day 17b: the API on a Hugging Face Docker Space instead of Render

- **Decision:** the API and worker run on a free Hugging Face Docker Space (CPU basic, 2 vCPU, 16 GB, no card). The Space holds only `infra/hf-space/Dockerfile` and its README; the build clones the public GitHub repo and builds the API, so there is one source of code. Secrets live in the Space settings; the Pages proxy points `API_ORIGIN` at the Space.
- **Alternatives:** Render (needs a card through Stripe, which rejects prepaid and wallet cards); Koyeb (needs a card since February 2026); Railway (a one-time $5 trial, about a month); Neon Functions (no card, but a `fetch` handler, no always-on worker and 10 active hours a month); the laptop behind a Cloudflare Tunnel (only up while it's on).
- **Why:** the only free, card-less host that keeps a long-running Node process (pg-boss worker, SSE). Risks: outgoing port 5432 isn't documented as open (fallback: Neon's port-443 driver), and deploys are a manual Factory rebuild.

### 2026-11-13 · Day 17b (final): Vercel Hobby, serverless, instead of an always-on host

- **Decision:** the web app and the API deploy as one Vercel Hobby project (no card): static files plus one function running the NestJS app. No pg-boss on Vercel: messages are sent right after the write that queued them (`OUTBOX_SEND_INLINE=1`), and `GET /internal/tick` (guarded by `CRON_SECRET`) runs the daily jobs and sends what quiet hours held, from Vercel's daily cron at 08:00 Cairo; an hourly cron-job.org call retries failures. The live list polls the database every second instead of an in-process bus. This replaces the Hugging Face plan above (Docker Spaces became paid) and the Cloudflare Pages proxy (one origin on Vercel).
- **Alternatives:** Render, Koyeb, Fly.io (all need a card); Hugging Face Docker (now paid); Railway (a month-long trial); the laptop behind a tunnel (only up while it's on); a per-minute cron (keeps Neon awake and exceeds its free compute hours).
- **Why:** free with no card and no expiry, one origin without a proxy, and the real client IP for rate limits. The always-on mode (pg-boss, migrations at boot) stays in the code for a VPS. Costs: up to 1 s live delay, cold starts, and Hobby's non-commercial terms.

### 2026-11-15 · v1: exam results as a whole-grid replace, sent through the outbox

- **Decision:** a grade grid is saved with one `PUT` that replaces all results of the exam under a row lock; parents get results only on an explicit "send", as `exam_result` outbox rows keyed by exam, guardian and a hash of that guardian's results.
- **Alternatives:** one request per cell (chatty, half-saved grids on a bad connection); sending on every save (parents get a message per correction); a key with a results revision (allows corrections, but needs a version column and wording for "corrected").
- **Why:** one tap, idempotent, and the same exactly-once machinery as absences; the hash in the key lets a correction reach only the affected parents without a version column.

### 2026-11-15 · v1: fee reminders from the daily job, once a month, off by default

- **Decision:** the daily charges job queues one `fee_overdue` outbox row per guardian from the 7th of the month, keyed by local month and guardian; the switch defaults to off.
- **Alternatives:** a reminder on every charge (parents texted on the 1st before they could pay); a daily reminder (spam); a separate scheduled job (another cron on a free host that allows one a day).
- **Why:** reuses the daily run and the outbox's exactly-once key; off by default because money texts must wait until a center trusts its records.

### 2026-11-15 · v1: rooms enforced by an exclusion constraint on sessions

- **Decision:** `rooms` per workspace; the room sits on the group and is copied onto each generated session; `sessions_room_no_overlap` (btree_gist, non-cancelled sessions with a room) is the backstop; the API checks a group's weekly slots against the room's other active groups under a row lock on the room and returns `ROOM_BOOKED` with the clash.
- **Alternatives:** an API-only check (races, and every future write path must remember it); the constraint only (no friendly error naming the slot, and it fires per session, not per weekly slot); the room on groups only (a moved or past session couldn't keep its own room).
- **Why:** the database guarantees the rule under concurrency; the API gives the translated message; a session generated over a moved session gets no room instead of failing the whole job.

### 2026-11-15 · v1: editable message templates in workspace settings, filled at send time

- **Decision:** a center's wording per trigger and language lives in `workspaces.settings.templates` (null = default); the defaults, the placeholder lists and `fillTemplate` are in `packages/contracts`; the sender fills the text at send time; unknown placeholders are refused on save (`TEMPLATE_PLACEHOLDER_UNKNOWN`).
- **Alternatives:** a `message_templates` table (a migration, RLS and a join for ten strings per center); rendering when the message is queued (an edit would never reach messages already waiting); free text without placeholders (the center would type each name).
- **Why:** no migration, one read per send pass, a preview that matches the sent text, and stored bodies keep the log honest.

### 2026-11-15 · v1: re-check outbox rows at send time, keep them as `skipped`

- **Decision:** the sender re-reads the facts a message states (trigger switch, balances, absences) on the locked row just before the provider call, rewrites the payload or marks the row `skipped` with a reason.
- **Alternatives:** delete or update queued rows from every write that could make them stale (payments, reversals, attendance edits, settings); delete the row instead of `skipped` (the dedupe key would free up and a rerun could queue it again).
- **Why:** one place knows the rules, quiet-hour rows are covered, and the log shows why a message never went out.

### 2026-11-15 · v1: a request transaction for tenant writes (audit in the same commit)

- **Decision:** the audit interceptor opens one transaction per tenant write request and stores it in `AsyncLocalStorage`; `inTenant` joins it as a savepoint; the audit row is inserted last; after-commit work (the inline outbox flush) waits for the commit.
- **Alternatives:** pass a `tx` through every service and repository (every signature changes); write the audit row inside each feature's transaction by hand (easy to forget on a new endpoint); keep the separate audit transaction (a failed audit row leaves an unrecorded write).
- **Why:** one place, no call-site changes, and savepoints keep each repository block's own rollback (payment repeats, constraint errors mapped to codes). Cost: locks are held to the end of the request, and handlers must not run repository calls in parallel.

### 2026-11-15 · v1: removed members are a status, not a deleted row

- **Decision:** `memberships.status = removed`; every membership lookup reads active rows; no refresh-token revocation.
- **Alternatives:** delete the row (groups, sessions and the audit log point at it); revoke the person's refresh tokens (signs them out of every other center too).
- **Why:** history stays intact, the tenant guard already checks membership per request, so access ends on the next request.


### 2026-11-17 · Rate limits in PostgreSQL, not memory or Redis

- **Decision:** a global `rate_limits` table (key, count, reset_at), one `INSERT … ON CONFLICT DO UPDATE` per hit, `take` counting only keys under the limit; the daily job sweeps expired rows.
- **Alternatives:** keep process memory (a restart, a sleeping instance or a second Vercel instance resets or splits the counts); Redis (a second service, and the free tier's daily command cap).
- **Why:** the lockout must hold on a host that restarts often, and PostgreSQL is already there. The row lock on the key makes concurrent hits count one after another. Cost: one or two small queries per login and scan.

### 2026-11-22 · Audit rows for routes outside a workspace, in the route's own transaction

- **Decision:** the interceptor puts a pending audit row in AsyncLocalStorage; `recordAudit(tx)` writes it as the last statement of the route's success transaction (invite accept, check-in, new workspace, student code, password reset), and the interceptor then skips its own. Sign-in, sign-out and the code requests keep the after-handler row.
- **Alternatives:** one interceptor transaction around the handler (rolls back a failed sign-in's rate-limit hit and a reuse revocation); passing the row down as a parameter (every layer changes).
- **Why:** the domain write and its record commit together where it matters, failures keep their own commits, and only five repository lines change.
