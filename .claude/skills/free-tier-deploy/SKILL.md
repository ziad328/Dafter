---
name: free-tier-deploy
description: Use when deploying Dafter or changing deployment - Render, Neon, Cloudflare Pages, environment variables, migrations on deploy, health checks, uptime pings.
---
- The step-by-step guide is docs/deploy.md; keep it in sync with any change here.
- Web: Cloudflare Pages builds apps/web (root directory apps/web, output dist). apps/web/functions/[[path]].ts proxies /api/* and /health to API_ORIGIN (public/_routes.json limits it to those), so the browser sees one origin and the SameSite=Strict refresh cookie works. VITE_API_URL stays empty. No logic in the proxy.
- API and worker: one Render web service from render.yaml; `node apps/api/dist/main.js` with MIGRATE_ON_START=1 (migrations at boot), RUN_WORKER=true, TRUST_PROXY=1, MAIL_PROVIDER=brevo. Never DEV_MAIL_INBOX.
- Database: Neon pooled connection string in DATABASE_URL, the direct one in DIRECT_DATABASE_URL (migrations, seeds, pg-boss). Never ping the database. Demo data: `pnpm demo:seed:neon` with a local .env.neon (rerun-safe).
- /health returns 200 without touching the database; an uptime monitor pings it every 10 minutes.
- No files on disk; secrets only in each provider's environment settings.
- After every deploy, run `E2E_BASE_URL=<pages url> pnpm e2e:live` (read-only smoke test).
