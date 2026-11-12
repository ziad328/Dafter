# Architecture & stack

Dafter is one TypeScript monorepo where a single set of Zod schemas drives backend validation, the OpenAPI spec, the generated RTK Query hooks, and the React Hook Form rules, so the frontend and backend cannot drift apart.

*(Diagram in the plan doc: system architecture · 7 parts on one VPS.)*

The browser only ever talks to the API through Caddy; anything slow or retryable, like sending a WhatsApp message, goes through a pg-boss job queue inside PostgreSQL to the worker, and provider delivery webhooks come back into the API.

## Stack

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
| Cache and rate limits | In process at first; Redis only at the VPS stage, once there are several API replicas | No extra service to run or pay for until traffic needs one |
| Auth | Built in-house: argon2id, 15-minute JWT access token, rotating refresh token in an httpOnly cookie | Shows you understand auth instead of renting it |
| Frontend | React 19, Vite, React Router, Redux Toolkit + RTK Query, React Hook Form, vite-plugin-pwa for the installable student app | Your current stack, so you move fast |
| UI and RTL | Tailwind CSS v4 with logical properties, shadcn/ui on Radix | Radix supports `dir="rtl"`; logical classes flip automatically |
| i18n | react-i18next with ICU messages | Arabic needs six plural forms; ICU handles them |
| QR | Rotating session QR (an HMAC per 10-second window) drawn on the teacher's screen; students scan with a zxing-based scanner; check-ins are signed by a non-extractable WebCrypto device key | A forwarded photo expires in seconds, and one phone serves only one account |
| PDFs (receipts) | Print-ready HTML pages that the browser saves as PDF | The browser shapes Arabic perfectly, and the server never runs Chromium |
| Messaging | Provider adapters: WhatsApp Cloud API, SMS, email for login codes, and a dev console adapter | Swap providers without touching business logic |
| Logs | pino JSON logs with request ID and workspace ID | Trace one request across API and worker |
| Hosting | Free tiers for the demo; from the first paying customer, Docker Compose on one VPS with Caddy for automatic HTTPS and images in GitHub Container Registry (see hosting-saas.md) | A real deployment you control, not a managed backend |
| Backups | From the VPS stage: nightly `pg_dump` to S3-compatible storage, plus continuous WAL archiving with pgBackRest, restore tested monthly | Money data must be recoverable |

**Why Vite, not Next.js.** NestJS is already the backend, so Next's API routes and server actions would duplicate it. Everything sits behind a login, so server rendering and SEO add nothing. A Vite build is static files on Cloudflare Pages, and `vite-plugin-pwa` makes the student app installable with little setup. A public landing page for selling Dafter, where SEO does matter, can be a small separate site later (Astro or Next), outside this app.

## How the pieces stay in sync

1. A Zod schema in `packages/contracts` defines every request, response and error code.
2. NestJS validates incoming requests and outgoing responses against that schema.
3. A build step writes `openapi.json` from the schemas.
4. RTK Query codegen turns `openapi.json` into typed hooks inside the web app.
5. Forms import the same schema through `zodResolver`, so the browser rejects bad input with the same rules as the server.
6. CI regenerates the spec and the client and fails if the committed files differ, and `oasdiff` flags any breaking API change.
7. The API returns error codes, never sentences; the web app translates each code into Arabic or English.

## Repository layout

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
  docs/           This plan, progress.md, decisions.md
  .claude/skills/ Project skills that Claude Code loads automatically
  CLAUDE.md       Build instructions for Claude Code
```

## Multi-tenancy

Every tenant-owned table has a `workspace_id` column, and isolation is enforced in three layers.

1. **Guard.** Each request carries the selected workspace. A NestJS guard checks that the user has a membership there and loads their role and scope.
2. **Repository.** Every query is built through a tenant-scoped repository that always adds the workspace filter.
3. **Database.** Each request runs in a transaction that sets `app.workspace_id`, and PostgreSQL row-level security policies refuse rows from any other workspace. If layer 2 has a bug, layer 3 still blocks the leak.

An assistant's narrower scope (only some teachers' groups) is checked in the service layer with a policy function per resource, and covered by tests.

## Auth

- Passwords hashed with argon2id; login rate-limited per phone number and per IP.
- Access token: JWT, 15 minutes, kept in memory in the browser.
- Refresh token: random, stored hashed in the database, sent as an httpOnly, Secure, SameSite cookie, rotated on every use.
- Reuse detection: if an old refresh token is used again, the whole token family is revoked and the user must log in again.
- Invites: single-use signed links that expire after 72 hours.
- Students sign in without a password: a 6-digit one-time code by email (v0) or WhatsApp (later), valid 5 minutes, stored hashed, 5 attempts, rate-limited per phone or email.
- A student's session works only from their bound phone. An assistant can reset the binding when the student changes phones, and the reset is audited.

## Built for speed and traffic

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
