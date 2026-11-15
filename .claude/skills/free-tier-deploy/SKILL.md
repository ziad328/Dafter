---
name: free-tier-deploy
description: Use when deploying Dafter or changing deployment - Vercel, Neon, Brevo, environment variables, migrations, crons, health checks.
---
- The step-by-step guide is docs/deploy.md; keep it in sync with any change here.
- Host: one Vercel Hobby project (free, no card) from vercel.json at the repo root: the built web app (apps/web/dist) plus one function, api/index.js → apps/api/dist/vercel.bundle.cjs (NestJS on Fastify, booted once per warm instance). The bundle (`pnpm --filter @dafter/api bundle`, esbuild) is required: Vercel's loader can't require() ESM packages such as NestJS 12, which plain Node 22.12+ allows. Test with `node --no-experimental-require-module`. Functions run in fra1, next to Neon. /api/* and /health go to the function, everything else to index.html, so web and API share one origin (SameSite=Strict refresh cookie, no CORS). Rule 14 holds: the function is the NestJS app, not frontend code.
- No worker on Vercel: OUTBOX_SEND_INLINE=1 sends a workspace's due messages right after the write that queued them; GET /api/v1/internal/tick (Bearer CRON_SECRET) sends due messages, and with daily=1 also generates sessions and monthly charges. Vercel's cron calls it daily at 06:00 UTC (08:00 Cairo, end of quiet hours); cron-job.org may call it hourly for retries. Never every minute: it keeps Neon awake and burns its free compute hours.
- RUN_WORKER and MIGRATE_ON_START are for a long-running host (a future VPS); never set them on Vercel. Never DEV_MAIL_INBOX (the API refuses to start with it in production). DEV_FAKE_PHONE works in production only with DEMO_DEPLOY=1, set on the public demo alone. TRUST_PROXY=1 (Vercel sets X-Forwarded-For).
- Database: Neon pooled URL in DATABASE_URL, direct in DATABASE_URL_UNPOOLED. Migrations run in CI: the `migrate` job on `main` (after `check` and `e2e`, secret NEON_DATABASE_URL_UNPOOLED), and Vercel's Deployment Checks wait for it, so each migration must only add. A new database is set up from a laptop: `pnpm demo:seed:neon` (migrates, then seeds only if empty) with a local .env.neon. Never ping the database.
- /health returns 200 without touching the database. No uptime pinger is needed on Vercel.
- No files on disk; secrets only in Vercel's environment variables.
- After every deploy, run `E2E_BASE_URL=<vercel url> pnpm e2e:live` (read-only smoke test).
