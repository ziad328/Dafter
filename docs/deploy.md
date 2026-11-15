# Deploying the free demo (Day 17)

Four free accounts, none needs a card. Each step says what to click, what to copy and how to check it. Secrets go only into each provider's settings or your local `.env.neon` (git ignores it); never paste them into chat or commit them.

```
phone ──► Vercel (web app files + one function running the NestJS API) ──► Neon (PostgreSQL)
                                     └──► Brevo (login code emails)
Vercel cron, daily 08:00 Cairo ──► /api/v1/internal/tick?daily=1 (quiet-hour messages, sessions, charges)
cron-job.org, hourly (optional) ──► /api/v1/internal/tick (retries failed messages)
```

The web app and the API share one Vercel URL, so the refresh cookie (`SameSite=Strict`) works and there is no CORS. No server keeps running: the API starts on the first request (about 1–2 s after a quiet spell), parent messages are sent right after the action that creates them, and the cron does the rest. Neon sleeps whenever nobody uses the app, which keeps it inside the free compute hours.

UIs change; if a button has moved, look for the same words nearby. Free-tier limits change too: check each pricing page once before you rely on it.

## 0. Push to GitHub

Vercel builds from GitHub `main` on every push. Push the latest commits first:

```bash
git push origin main
```

## 1. Brevo (login code emails) — about 10 minutes

1. Sign up at brevo.com (free plan). Skip the marketing set-up questions.
2. **Verify a sender:** top-right menu → **Senders, Domains & Dedicated IPs** → **Senders** → **Add a sender**. Use an address you own (Gmail works). Open the confirmation email and click the link.
3. **API key:** top-right menu → **SMTP & API** → **API Keys** → **Generate a new API key**, name it `dafter-api`. Copy it once; Brevo won't show it again.
4. Keep these two for step 3 (Vercel): `BREVO_API_KEY` (the key) and `MAIL_FROM` (the verified sender address).

Check: the sender shows as **Verified**.

## 2. Neon (database) — about 10 minutes

1. Sign up at neon.tech (free plan) → **New project**.
   - Name: `dafter` · PostgreSQL version: **17** · Region: **AWS Europe (Frankfurt)** (closest to Egypt).
2. On the project dashboard, click **Connect**. You need two connection strings:
   - **Pooled:** with **Connection pooling** on (the host contains `-pooler`). This is `DATABASE_URL`.
   - **Direct:** with **Connection pooling** off. This is `DATABASE_URL_UNPOOLED` (migrations use it).
   Both should end in `?sslmode=require`.
3. In the repo root, create `.env.neon` (git ignores `.env.*`). Either with the Neon CLI (`npm i -g neon`, then `neon login`; the project is linked in the git-ignored `.neon` file):

   ```bash
   neon env pull --file .env.neon -e DATABASE_URL -e DATABASE_URL_UNPOOLED
   ```

   Always pass `--file .env.neon`: without it the CLI writes into your existing `.env` and points local development at Neon. Or by hand:

   ```
   DATABASE_URL=<pooled string>
   DATABASE_URL_UNPOOLED=<direct string>
   ```

4. Migrate and load the demo data (Arabic names, 3 groups, 12 students, 2 past weeks of attendance):

   ```bash
   pnpm demo:seed:neon
   ```

Check: it prints `Seeded the demo center…`. Running it again prints `Demo data already there`.
If it fails with `permission denied to create role` or a `pg_trgm` error, stop and send me the error line (no connection string).

## 3. Vercel (web app and API) — about 15 minutes

1. Sign up at vercel.com with **Continue with GitHub** and pick the free **Hobby** plan (personal, non-commercial use: fine for a demo, not for a paying center).
2. **Add New…** → **Project** → **Import** the `Dafter` repo (allow Vercel to see it if asked).
3. On the configure screen:
   - Framework Preset: **Other**
   - Root Directory: `./` (the repo root; leave it)
   - Build, Output and Install settings: leave them; `vercel.json` sets them
4. **Environment Variables** (add each, for Production):

   | Key | Value |
   |:--|:--|
   | `DATABASE_URL` | the line from `.env.neon` with `-pooler` |
   | `DATABASE_URL_UNPOOLED` | the other line from `.env.neon` |
   | `JWT_SECRET` | a random value (below) |
   | `QR_SECRET` | another random value |
   | `CRON_SECRET` | another random value; also needed in step 4 |
   | `BREVO_API_KEY` | from step 1 |
   | `MAIL_FROM` | from step 1 |
   | `MAIL_PROVIDER` | `brevo` |
   | `TRUST_PROXY` | `1` |
   | `OUTBOX_SEND_INLINE` | `1` |
   | `DEV_FAKE_PHONE` | `1` (the public demo only) |
   | `DEMO_DEPLOY` | `1` (the public demo only; without it `DEV_FAKE_PHONE` is ignored in production) |

   Random values: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, once per secret.
   Never add `DEV_MAIL_INBOX` (it shows login codes to anyone; the API refuses to start with it in production), `RUN_WORKER` or `MIGRATE_ON_START` (those are for an always-on server).
5. **Deploy**. The first build takes about 3–5 minutes. Copy the URL, e.g. `https://dafter-xyz.vercel.app`.

Check, all on that URL:
- `/health` → `{"status":"ok"}`
- `/login` shows the Arabic login page; sign in as `01000000002` / `dafter-dev-123`, pick سنتر النور, reload: you stay signed in (the cookie works).
- Project → **Settings** → **Cron Jobs** lists `/api/v1/internal/tick?daily=1` at `0 6 * * *` (08:00 Cairo).

**New database migrations:** CI's `migrate` job applies them to Neon on every push to `main`, after all tests pass, Playwright included (a red or flaky run holds back the migration and, with the Deployment Check, the release; re-run the failed job) (secret `NEON_DATABASE_URL_UNPOOLED`: Neon's direct connection string, under GitHub → Settings → Secrets and variables → Actions). For Vercel to wait for it, turn on Project → **Settings** → **Deployment Checks** and require the `migrate` check; then a build only gets the production domain once its migrations are in. Until then the old code runs on the new schema, so a migration only adds (a column, a table, an enum value); drop or rename in a later push, once no live code uses the old name.

By hand (a new database, or when the job can't run), migrations only, no seed:

```bash
pnpm --filter @dafter/db exec tsx --env-file=../../.env.neon src/scripts/migrate.ts
```

Nov 15: `0010` and `0011` were missed by hand, and groups and the timetable answered 500 until they were applied; that is why it is a CI job now.

## 4. cron-job.org (hourly retries, optional) — about 5 minutes

Messages leave right after the action, and the daily cron sends what quiet hours held. This hourly call only retries messages that failed (for example, Brevo or the provider was down); skip it if you like.

1. Sign up at cron-job.org (free, no card) → **Create cronjob**.
2. URL: `<Vercel URL>/api/v1/internal/tick` · Schedule: **every hour**.
3. **Advanced** → Headers → add `Authorization` = `Bearer <your CRON_SECRET>` · Request method **GET**.
4. Save, then **Test run**: the response is `{"sent":0}` (or more) with status 200. A 401 means the header is wrong.

Hourly, not every minute: each call wakes Neon, and a database that never sleeps uses up the free compute hours.

## 5. Live smoke test

From the repo root, against the Vercel URL:

```bash
E2E_BASE_URL=https://dafter-xyz.vercel.app pnpm e2e:live
```

In PowerShell: `$env:E2E_BASE_URL='https://dafter-xyz.vercel.app'; pnpm e2e:live`.
It runs only the sign-in and workspace-switch test (it changes no data), in Arabic and English. Run it after every deploy.

## 6. By hand, once, on real phones

These can't be automated (see `docs/known-limits.md`):

- **Android (Chrome):** open an invite link from the student page → Install → in the installed app, log in with the emailed code → bind → scan the teacher's QR from a laptop screen.
- **iPhone (Safari):** the same, using **Share → Add to Home Screen**, then paste the invite link inside the installed app.
- The teacher's live QR screen on a laptop: rotates every 10 seconds; a check-in appears within about a second.
- Close the session: the absence shows on `/dev/phone` at once (or at 08:00 Cairo during quiet hours).

## Demo accounts and resetting the data

- Owner `01000000001`, teacher `01000000002`, assistant `01000000003`, password `dafter-dev-123`. Anyone with the link can sign in: it's a demo, never real data.
- To reset: Neon → **SQL Editor** → run `DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE;` → then `pnpm demo:seed:neon`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|:--|:--|:--|
| Build fails at `pnpm install` | Lockfile out of date | Run `pnpm install` locally, commit `pnpm-lock.yaml`, push |
| `/health` returns 500; function log: `DATABASE_URL is not set` or `QR_SECRET is not set` | Variable missing | Project → Settings → Environment Variables → add → **Redeploy** |
| Function log: `MAIL_PROVIDER=brevo needs…` | Brevo variables missing | Add `BREVO_API_KEY` and `MAIL_FROM`, redeploy |
| Function log: `relation … does not exist` or `column … does not exist`; lists answer 500 `INTERNAL` | A migration wasn't run on Neon | The migrate command above, then retry |
| `/login` shows a 404 page | `vercel.json` rewrites not picked up | Check Root Directory is the repo root |
| The live list stops for ~2 s every 5 minutes | Vercel ends a function after 300 s; the screen reconnects | Expected |
| Login code email never arrives | Sender not verified, or the free daily limit reached | Brevo → Transactional → Logs |
| Neon shows the compute suspended (quota) | Something wakes it too often | Check the cron-job.org schedule is hourly, not every minute |
