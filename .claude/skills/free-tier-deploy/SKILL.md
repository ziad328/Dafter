---
name: free-tier-deploy
description: Use when deploying Dafter or changing deployment - Render, Neon, Cloudflare Pages, environment variables, migrations on deploy, health checks, uptime pings.
---
- Web: Cloudflare Pages builds apps/web; the API URL comes from an environment variable.
- API and worker: one Render web service; the start command runs migrations, then starts the API with RUN_WORKER=true.
- Database: Neon pooled connection string in DATABASE_URL. Never ping the database.
- /health returns 200 without touching the database; an uptime monitor pings it every 10 minutes.
- No files on disk; secrets only in each provider's environment settings.
- After every deploy, run the Playwright smoke tests against the live URL.
