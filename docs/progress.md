# Progress — v0 (Nov 13 – Nov 30, 2026)

Tick a task when done, with a one-line note (what was done, anything left). Split tasks here if they outgrow their day.

## Setup

- [x] **Setup (Nov 12):** CLAUDE.md, docs/ from the plan doc, 11 project skills, official `frontend-design` and `webapp-testing` skills. Note: skills live only in `.claude/skills/`, not duplicated in CLAUDE.md.

## Week 1: foundations and accounts

- [ ] **Day 1 (Nov 13):** pnpm + Turborepo monorepo, shared tsconfig/ESLint/Prettier, lefthook pre-commit, NestJS (Fastify) and Vite React skeletons, empty packages, Docker Compose with PostgreSQL 17, `.env.example`.
- [ ] **Day 2 (Nov 14):** Drizzle setup and first migration (users, refresh_tokens, workspaces, memberships, assistant_scopes, invites, audit_log), seed script, Testcontainers harness that clones a template database per worker, GitHub Actions CI (lint, typecheck, unit, integration).
- [ ] **Day 3 (Nov 15):** `packages/contracts` with Zod, OpenAPI generation, RTK Query codegen, CI contract check, error-code format; `packages/i18n` and the web shell (Arabic default, RTL, language switch, Arabic-capable font, lint rule banning physical-direction classes). Run `/run-skill-generator` once `pnpm dev` works.
- [ ] **Day 4 (Nov 16):** staff auth: register, login (argon2id, rate limit), 15-minute access JWT, rotating refresh token in an httpOnly cookie with family reuse detection, logout, `GET /me`, full tests. *Hard part.*
- [ ] **Day 5 (Nov 17):** workspaces (create, list, switch with `X-Workspace-Id`), tenant guard, tenant-scoped repository, RLS policies with `SET LOCAL app.workspace_id`, generated isolation test suite. *Hard part.*
- [ ] **Day 6 (Nov 18):** invites (single use, 72 hours), assistant scopes, audit-log interceptor; web: register, login and workspace-switcher screens.
- [ ] **Day 7 (Nov 19, half day):** Playwright setup and a smoke test for login and workspace switch; fix anything left from the week.

## Week 2: the core loop

- [ ] **Day 8 (Nov 20):** subjects and grade levels seeded with the Egyptian curriculum, groups and group slots (contracts, API, screens).
- [ ] **Day 9 (Nov 21):** session generation as a pg-boss scheduled job (4 weeks ahead, uses the `Clock` service), cancel and move a session, weekly timetable screen.
- [ ] **Day 10 (Nov 22):** students, guardians and student_guardians; shared Arabic normalize function and `pg_trgm` search; duplicate-phone warning.
- [ ] **Day 11 (Nov 23):** enrollments; student invites; student login with a 6-digit one-time code by email (console adapter in development); phone binding with a non-extractable WebCrypto key (done inside the installed app once Day 14 adds the PWA); assistant reset of a binding. *Hard part.*
- [ ] **Day 12 (Nov 24):** attendance API: open session (returns the per-session QR secret and the server time), `POST /check-ins` that verifies the 10-second window (current or previous), the device signature and enrollment or make-up, unique on session and student; manual marking by the assistant; late threshold. *Hard part.* Schedule checkpoint: propose cuts if behind.
- [ ] **Day 13 (Nov 25):** teacher's full-screen rotating QR with a live check-in list over server-sent events; student scan screen with instant confirmation; close session marks absences; Playwright test with two browser contexts (teacher and student) and fake time. Checkpoint: if the core loop works, start the fees stretch after Day 14's student screens.
- [ ] **Day 14 (Nov 26, half day):** student app as an installable PWA (vite-plugin-pwa, Arabic name and icon, persistent-storage request) with my schedule and my attendance history; activation flow: invite link, install to home screen, log in with the code inside the installed app, bind the phone there; then buffer, or the fees stretch (ledger and payments with idempotency).

## Week 3: messages and ship

- [ ] **Day 15 (Nov 27):** `outbox_messages`, transactional write on session close, unique `dedupe_key`, sibling merge, quiet hours, pg-boss worker, console adapter and "fake phone" page. *Hard part.*
- [ ] **Day 16 (Nov 28):** Arabic and English templates with per-workspace toggles, session-cancelled messages, message log screen, exactly-once tests.
- [ ] **Day 17 (Nov 29):** free-tier deploy: Neon database, Render web service running API and worker in one process, Cloudflare Pages, `/health` endpoint, uptime ping, migrations on deploy, free-tier email service for login codes, demo seed with Arabic names.
- [ ] **Day 18 (Nov 30):** README (architecture diagram, key decisions, how to run, test strategy), demo video, full test run, tag `v0.1.0`.
