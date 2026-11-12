# Testing & CI/CD

Every pull request runs seven automated checks, from type-checking to end-to-end tests in both languages, and nothing reaches production without passing them on staging first. Target: a full PR run in under 10 minutes.

## Test layers

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

## Making tests reliable

- **One database container per run.** Each test worker clones a migrated template database (`CREATE DATABASE … TEMPLATE`), so tests run in parallel without sharing state.
- **Controlled time.** A `Clock` service is injected everywhere; tests set the time to check quiet hours, due dates and session generation.
- **Factories and seed.** Test factories build valid students, groups and ledgers in one line. The seed script creates a demo center with realistic Arabic names for local work and for the live demo.
- **No real messages in tests.** The console adapter records every message, and tests assert on what it received.
- **Coverage where it matters.** Coverage is reported for all packages, with an 80% floor enforced only on the domain services (attendance, money, messaging).

## Critical end-to-end scenarios

1. Owner signs up, creates a center, invites an assistant, and the assistant joins with the right scope.
2. Teacher creates a group with two weekly slots; four weeks of sessions appear.
3. Assistant registers and enrolls a student; the student activates the app with an email code on a phone-sized browser and the phone is bound to the account.
4. Teacher opens a session; 5 students check in by scanning the rotating QR (one scans twice, one uses a 30-second-old code and is rejected, one tries from a second phone and is rejected); the assistant ticks one phoneless student; the teacher closes the session; everyone else is absent and exactly one absence message per guardian is queued.
5. A payment is recorded, reversed, and recorded again; the balance and the cash summary are correct.
6. Teacher enters exam scores, one above the maximum is rejected, and results are sent.
7. A user in two workspaces switches between them and never sees the other's data.

Scenario 4 runs with two browser contexts (teacher screen and student phone) and fake time, and again on a throttled network to prove a slow check-in still counts once.

## Pull request pipeline (`ci.yml`)

1. Install with pnpm and restore the Turborepo cache.
2. In parallel: lint, type-check, format check, i18n key check.
3. Unit and component tests for affected packages.
4. API integration and tenant isolation tests against Testcontainers.
5. Contract check: regenerate the spec and client, fail on any diff, run `oasdiff`.
6. Build the Docker images.
7. Start the stack with Docker Compose and run the Playwright smoke set; upload the report and traces when anything fails.

Branch protection on `main` requires all seven to pass. Commits follow Conventional Commits, and PRs are squash-merged.

## Release pipeline (`deploy.yml`, on merge to `main`)

1. Build images tagged with the commit SHA and push them to GitHub Container Registry.
2. Deploy to staging (same VPS, separate Compose project, `staging.` subdomain).
3. Run migrations as a one-off container. Migrations are backward-compatible (add first, remove later), so the previous version keeps working during the deploy.
4. Run the Playwright smoke set against staging.
5. A manual approval in a GitHub environment promotes the same SHA to production.
6. A health check runs after the switch; if it fails, the previous SHA is redeployed automatically.

**Until the VPS stage (including v0):** there is no staging server. Render and Cloudflare Pages deploy `main` automatically, migrations run when the API starts, and the Playwright smoke set runs against the live demo URL after each deploy. The release pipeline above starts with the first paying center.

**Scheduled jobs:** the full end-to-end suite every night, Renovate dependency updates every week, and a backup restore test every month.

## Local development

- `pnpm dev` starts PostgreSQL in Docker, then the API, worker and web app with hot reload.
- `pnpm db:reset` drops, migrates and seeds the database.
- `pnpm test` runs everything CI runs except end-to-end; `pnpm e2e` runs Playwright locally with the UI mode.
