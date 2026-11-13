# Build instructions (CLAUDE.md)

This tab is the operating manual for Claude Code: save it as `CLAUDE.md` at the repo root, and Claude follows it every session, starting with Day 1 of the v0 plan below.

## Setup (for Ziad, once)

1. Export this doc to Markdown.
2. Save this tab as `CLAUDE.md` in the repo root.
3. Save the other tabs as `docs/product.md`, `docs/architecture.md`, `docs/hosting-saas.md`, `docs/data-model-api.md`, `docs/bilingual-messaging.md`, `docs/testing-ci.md` and `docs/agile-plan.md`.
4. Open Claude Code in the repo and send: "Read CLAUDE.md and follow the start-of-session protocol."

## Project

Dafter (دفتر) is a bilingual (Arabic-first, English) multi-tenant SaaS for Egyptian tutoring centers and independent teachers: groups, sessions, students with their own app, rotating-QR attendance, and parent messages. Ziad builds it solo as a portfolio piece and future product. The full plan is in `docs/`; read only the file a task needs.

## Working with Ziad

- Be collaborative and straightforward: short answers, no long explanations unless asked.
- Judge the code by junior-professional standards, not student standards. Point out real problems directly.
- For any feature bigger than one file, give a short plan first (files, steps, risks) and wait for an OK before coding.
- Keep diffs small and focused on the task. Do not refactor unrelated code.
- You write the code; Ziad learns while building. For the hard parts (auth and refresh rotation, student login and phone binding, rotating-QR check-in, RLS and tenant isolation, outbox, idempotency, ledger), explain the approach in a few lines before coding and why it beats the alternatives. After coding, add 2 to 3 short interview-style questions with short answers to `docs/interview-questions.md` (do not ask them in the session; Ziad reviews them later).
- When a task is done, say so in one line, then check how full the context window is. At about 50% or more, start a new session for the next task yourself (do not tell Ziad to run `/clear`); below that, continue the next task in this session. If a session gets long, suggest `/compact`.

## Start-of-session protocol

1. Read this file, then `docs/progress.md` (create it from the v0 plan below if it does not exist).
2. Pick the first unchecked task. Say which one in one line.
3. Give the plan (and, for a hard part, the short explanation). Wait for OK.
4. Build it, run the narrowest tests that prove it, then `pnpm test` once.
5. Tick the task in `docs/progress.md` with a one-line note (what was done, anything left), and propose a Conventional Commit message.
6. Check context-window usage: at about 50% or more, stop and start a new session for the next task; below that, continue with the next task here (back to step 2).

**First session only:** before any Day 1 task, set up the skills from the Skills section at the end of this file, then continue with Day 1.

If a task turns out bigger than its day, split it in `docs/progress.md` and tell Ziad what moves. If the plan is behind on Nov 24, propose cuts in this order: staff invites, message log, student attendance-history screen. Never cut tests.

## Current goal: v0 by November 30, 2026

About 10 hours a day. Out of v0: exams, dashboard, offline scanning, real WhatsApp, rooms, monitoring stack. Stretch, only if the core loop works by Nov 25: basic fees (ledger and payments).

### Week 1: foundations and accounts

- [ ] **Day 1 (Nov 13):** pnpm + Turborepo monorepo, shared tsconfig/ESLint/Prettier, lefthook pre-commit, NestJS (Fastify) and Vite React skeletons, empty packages, Docker Compose with PostgreSQL 17, `.env.example`.
- [ ] **Day 2 (Nov 14):** Drizzle setup and first migration (users, refresh_tokens, workspaces, memberships, assistant_scopes, invites, audit_log), seed script, Testcontainers harness that clones a template database per worker, GitHub Actions CI (lint, typecheck, unit, integration).
- [ ] **Day 3 (Nov 15):** `packages/contracts` with Zod, OpenAPI generation, RTK Query codegen, CI contract check, error-code format; `packages/i18n` and the web shell (Arabic default, RTL, language switch, Arabic-capable font, lint rule banning physical-direction classes).
- [ ] **Day 4 (Nov 16):** staff auth: register, login (argon2id, rate limit), 15-minute access JWT, rotating refresh token in an httpOnly cookie with family reuse detection, logout, `GET /me`, full tests. *Hard part.*
- [ ] **Day 5 (Nov 17):** workspaces (create, list, switch with `X-Workspace-Id`), tenant guard, tenant-scoped repository, RLS policies with `SET LOCAL app.workspace_id`, generated isolation test suite. *Hard part.*
- [ ] **Day 6 (Nov 18):** invites (single use, 72 hours), assistant scopes, audit-log interceptor; web: register, login and workspace-switcher screens.
- [ ] **Day 7 (Nov 19, half day):** Playwright setup and a smoke test for login and workspace switch; fix anything left from the week.

### Week 2: the core loop

- [ ] **Day 8 (Nov 20):** subjects and grade levels seeded with the Egyptian curriculum, groups and group slots (contracts, API, screens).
- [ ] **Day 9 (Nov 21):** session generation as a pg-boss scheduled job (4 weeks ahead, uses the `Clock` service), cancel and move a session, weekly timetable screen.
- [ ] **Day 10 (Nov 22):** students, guardians and student_guardians; shared Arabic normalize function and `pg_trgm` search; duplicate-phone warning.
- [ ] **Day 11 (Nov 23):** enrollments; student invites; student login with a 6-digit one-time code by email (console adapter in development); phone binding with a non-extractable WebCrypto key (done inside the installed app once Day 14 adds the PWA); assistant reset of a binding. *Hard part.*
- [ ] **Day 12 (Nov 24):** attendance API: open session (returns the per-session QR secret and the server time), `POST /check-ins` that verifies the 10-second window (current or previous), the device signature and enrollment or make-up, unique on session and student; manual marking by the assistant; late threshold. *Hard part.* Schedule checkpoint: propose cuts if behind.
- [ ] **Day 13 (Nov 25):** teacher's full-screen rotating QR with a live check-in list over server-sent events; student scan screen with instant confirmation; close session marks absences; Playwright test with two browser contexts (teacher and student) and fake time. Checkpoint: if the core loop works, start the fees stretch after Day 14's student screens.
- [ ] **Day 14 (Nov 26, half day):** student app as an installable PWA (vite-plugin-pwa, Arabic name and icon, persistent-storage request) with my schedule and my attendance history; activation flow: invite link, install to home screen, log in with the code inside the installed app, bind the phone there; then buffer, or the fees stretch (ledger and payments with idempotency).

### Week 3: messages and ship

- [ ] **Day 15 (Nov 27):** `outbox_messages`, transactional write on session close, unique `dedupe_key`, sibling merge, quiet hours, pg-boss worker, console adapter and "fake phone" page. *Hard part.*
- [ ] **Day 16 (Nov 28):** Arabic and English templates with per-workspace toggles, session-cancelled messages, message log screen, exactly-once tests.
- [ ] **Day 17 (Nov 29):** free-tier deploy: Neon database, Render web service running API and worker in one process, Cloudflare Pages, `/health` endpoint, uptime ping, migrations on deploy, free-tier email service for login codes, demo seed with Arabic names.
- [ ] **Day 18 (Nov 30):** README (architecture diagram, key decisions, how to run, test strategy), demo video, full test run, tag `v0.1.0`.

## Stack

pnpm workspaces + Turborepo · TypeScript strict · NestJS (Fastify) · Zod contracts in `packages/contracts` → OpenAPI → RTK Query codegen · PostgreSQL 17 + Drizzle · pg-boss (jobs in PostgreSQL, no Redis) · React 19 + Vite + React Router + RTK Query + React Hook Form (zodResolver) · Tailwind v4 + shadcn/ui · react-i18next (ICU) · Vitest, Testcontainers, Playwright.

## Layout

`apps/api` (`main.ts` for HTTP, `worker.ts` for pg-boss workers) · `apps/web` · `packages/contracts`, `packages/db`, `packages/i18n`, `packages/config` · `e2e/` · `infra/` · `docs/`

## Rules (always)

1. Contract first: write or extend the Zod schema in `packages/contracts`, regenerate the client, then build the endpoint and the screen.
2. Every tenant table has `workspace_id`; every query goes through the tenant-scoped repository; RLS is the backstop. A new endpoint needs a new isolation test.
3. The API returns error codes (for example `ATTENDANCE_ALREADY_RECORDED`), never sentences; the web app translates them.
4. Every UI string has `ar` and `en` keys. No hard-coded text in JSX.
5. RTL: Tailwind logical classes only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), never `ml-`, `mr-`, `left-`, `right-`. Numbers, phones and codes go inside `<bdi>`.
6. Arabic search uses the shared normalize function (strip diacritics and tatweel; أ إ آ → ا, ة → ه, ى → ي) on save and on query.
7. Money is integer piastres; the ledger is append-only; mistakes are fixed with reversal entries.
8. Retryable writes (scans, payments) accept an `Idempotency-Key`; repeats return the first result.
9. Messages are written to `outbox_messages` in the same transaction as the event, with a unique `dedupe_key`.
10. Timestamps are `timestamptz` in UTC; the workspace timezone (Africa/Cairo) is used only for display and session generation. Inject a `Clock` service; never call `new Date()` in domain code.
11. No files on the server disk (the free-tier host wipes it). No secrets in the repo; use `.env` and GitHub secrets.
12. Receipts are print-ready HTML pages that the browser saves as PDF. The session QR is drawn on the teacher's screen, never printed.
13. Student login and phone binding happen inside the installed PWA, never in a browser tab: on iPhone the two have separate storage, and Safari may clear a website's storage after about 7 days without visits.
14. The web app is React + Vite, not Next.js. Do not add server rendering, Next.js, or API routes in the frontend; all server logic lives in NestJS. The one exception is `apps/web/functions/[[path]].ts`, a pure Cloudflare Pages proxy for `/api/*` and `/health` (same origin for the refresh cookie); never put logic in it.

## Definition of Done

- Unit and integration tests pass; user flows also have a Playwright test.
- Works in Arabic (RTL) and English on a phone-sized screen.
- Isolation tests cover any new endpoint.
- Lint, typecheck and the i18n key check pass (`pnpm test`).
- A short Conventional Commit message, for example `feat(attendance): close session marks absences`.

## Commands

`pnpm dev` (PostgreSQL in Docker, plus API, worker and web) · `pnpm db:reset` · `pnpm test` · `pnpm e2e`

Created during Days 1 to 3 and used by the skills: `pnpm contracts:gen` (OpenAPI + RTK Query client), `pnpm db:generate` (Drizzle migration), `pnpm i18n:check` (Arabic and English key sets match).

## Token-efficient habits

- Read only the files a task names; ask before scanning the whole repo.
- When Ziad pastes an error, work from those lines; ask for more only if needed.
- Edit existing files instead of rewriting them in full.
- Run the narrowest test that proves a change (one file or package), then the full suite once at the end.
- Routine work (CRUD, tests, translations) suits a lighter model; save the strongest model for auth, RLS, the outbox and design questions.

## Skills

Skills are folders at `.claude/skills/<name>/SKILL.md`. Claude loads a skill automatically when a task matches its description, so Ziad never picks skills by hand.

**Rules for Claude**

- In the first session, create every project skill in `.claude/skills/` exactly as written there, commit them (`chore: add project skills`), and confirm in one line.
- Use skills automatically. Never ask Ziad which skill to use; when a task matches several, follow all of them.
- When the same workflow repeats twice and no skill covers it, create a new project skill and mention it in one line.
- When a rule in this file changes, update the matching skill in the same commit.
- Ziad accepts the workspace trust prompt once when Claude Code first opens the repo; project skills need it.

**Built-in skills to use (Claude Code v2.1.145 or later)**

- `/run-skill-generator`: run once on Day 3, when `pnpm dev` works, so `/run` and `/verify` know how to start Dafter.
- `/verify`: after each feature, to confirm it really works in the running app.
- `/code-review`: before committing any hard part.
- `/debug`: when something fails at runtime and the cause is not obvious.

If any of these commands is not recognized in the current Claude Code version, skip it without asking: use the testing skill and the Playwright smoke tests instead of `/verify`, and a self-review against the Rules instead of `/code-review`.

**Official skills:** `frontend-design` and `webapp-testing` are copied from `github.com/anthropics/skills` into `.claude/skills/`. Install nothing from other sources without asking Ziad.

**Project skills** (in `.claude/skills/`): feature-workflow, nestjs-module, db-migration, tenant-isolation, react-screen, i18n-rtl, jobs-and-outbox, testing, hard-part-coach, task-finish, free-tier-deploy. The source of truth for each is its `SKILL.md`; the Build instructions tab in the plan doc holds the original text.
