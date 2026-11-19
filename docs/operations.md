# Operations

Running Dafter: deploying the free demo, hosting stages and the SaaS side, and the demo video script.

## Contents

1. [Deploying the free demo](#deploy) (was `docs/deploy.md`)
2. [Hosting & SaaS](#hosting-saas) (was `docs/hosting-saas.md`)
3. [Demo video script](#demo-script) (was `docs/demo-script.md`)

<a id="deploy"></a>

## Deploying the free demo (Day 17)

Four free accounts, none needs a card. Each step says what to click, what to copy and how to check it. Secrets go only into each provider's settings or your local `.env.neon` (git ignores it); never paste them into chat or commit them.

```
phone ──► Vercel (web app files + one function running the NestJS API) ──► Neon (PostgreSQL)
                                     └──► Brevo (login code emails)
Vercel cron, daily 08:00 Cairo ──► /api/v1/internal/tick?daily=1 (quiet-hour messages, sessions, charges)
cron-job.org, hourly (optional) ──► /api/v1/internal/tick (retries failed messages)
```

The web app and the API share one Vercel URL, so the refresh cookie (`SameSite=Strict`) works and there is no CORS. No server keeps running: the API starts on the first request (about 1–2 s after a quiet spell), parent messages are sent right after the action that creates them, and the cron does the rest. Neon sleeps whenever nobody uses the app, which keeps it inside the free compute hours.

UIs change; if a button has moved, look for the same words nearby. Free-tier limits change too: check each pricing page once before you rely on it.

### 0. Push to GitHub

Vercel builds from GitHub `main` on every push. Push the latest commits first:

```bash
git push origin main
```

### 1. Brevo (login code emails) — about 10 minutes

1. Sign up at brevo.com (free plan). Skip the marketing set-up questions.
2. **Verify a sender:** top-right menu → **Senders, Domains & Dedicated IPs** → **Senders** → **Add a sender**. Use an address you own (Gmail works). Open the confirmation email and click the link.
3. **API key:** top-right menu → **SMTP & API** → **API Keys** → **Generate a new API key**, name it `dafter-api`. Copy it once; Brevo won't show it again.
4. Keep these two for step 3 (Vercel): `BREVO_API_KEY` (the key) and `MAIL_FROM` (the verified sender address).

Check: the sender shows as **Verified**.

### 2. Neon (database) — about 10 minutes

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

### 3. Vercel (web app and API) — about 15 minutes

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

### 4. cron-job.org (hourly retries, optional) — about 5 minutes

Messages leave right after the action, and the daily cron sends what quiet hours held. This hourly call only retries messages that failed (for example, Brevo or the provider was down); skip it if you like.

1. Sign up at cron-job.org (free, no card) → **Create cronjob**.
2. URL: `<Vercel URL>/api/v1/internal/tick` · Schedule: **every hour**.
3. **Advanced** → Headers → add `Authorization` = `Bearer <your CRON_SECRET>` · Request method **GET**.
4. Save, then **Test run**: the response is `{"sent":0}` (or more) with status 200. A 401 means the header is wrong.

Hourly, not every minute: each call wakes Neon, and a database that never sleeps uses up the free compute hours.

### 5. Live smoke test

From the repo root, against the Vercel URL:

```bash
E2E_BASE_URL=https://dafter-xyz.vercel.app pnpm e2e:live
```

In PowerShell: `$env:E2E_BASE_URL='https://dafter-xyz.vercel.app'; pnpm e2e:live`.
It runs only the sign-in and workspace-switch test (it changes no data), in Arabic and English. Run it after every deploy.

### 6. By hand, once, on real phones

These can't be automated (see `docs/progress.md#known-limits`):

- **Android (Chrome):** open an invite link from the student page → Install → in the installed app, log in with the emailed code → bind → scan the teacher's QR from a laptop screen.
- **iPhone (Safari):** the same, using **Share → Add to Home Screen**, then paste the invite link inside the installed app.
- The teacher's live QR screen on a laptop: rotates every 10 seconds; a check-in appears within about a second.
- Close the session: the absence shows on `/dev/phone` at once (or at 08:00 Cairo during quiet hours).

### Demo accounts and resetting the data

- Owner `01000000001`, teacher `01000000002`, assistant `01000000003`, password `dafter-dev-123`. Anyone with the link can sign in: it's a demo, never real data.
- To reset: Neon → **SQL Editor** → run `DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE;` → then `pnpm demo:seed:neon`.

### Troubleshooting

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

<a id="hosting-saas"></a>

> **Status (Nov 19):** the free demo runs on **Vercel Hobby + Neon + Brevo**, not Render + Cloudflare Pages + R2 as planned in this part (Render, Koyeb and Fly.io need a card; Hugging Face Docker Spaces became paid). The live setup is [Deploying the free demo](#deploy) above; the reasons are in `tech.md` → Decisions (Day 17 and 17b). The stages and VPS notes still hold for the first paying center.

## Hosting & SaaS

Dafter costs $0 until the first center pays: build locally, demo on free tiers, then move to one €5–15/month VPS that the first customer's subscription pays for. Traffic stays small for a long time; correctness and scope are the real challenges, not scale.

### How big is it, really?

A center with 200 students arriving within 10 minutes produces about 0.3 scans per second. Even 100 such centers starting sessions at the same minute stay under 35 scans per second, inside the 50-per-second budget of one small server.

**Needed from day one (correctness):** tenant isolation, idempotent scans, secure rotating-QR check-in with phone binding, the outbox for messages, the money ledger, tests, and backups. This is the "real backend" work interviewers care about.

**Postponed until real load (scale):** multiple API replicas, PgBouncer, Prometheus and Grafana, Redis, read replicas, and nightly load tests. Run k6 once for the README; add the rest when monitoring shows a need.

**Why not Supabase + Vercel.** With Supabase, the database, auth, row-level security, file storage, and API are generated for you, so the backend is small. That ships faster, but it hides exactly the skills this project exists to show. Dafter keeps its own NestJS backend; a host such as Render or Neon only runs your code and your database, which is different.

**Scope is the real risk.** Seven modules in nine sprints is a lot for one person.

- [x] Decided: a lean v0 ships first, November 13 to 30 (accounts, groups and sessions, students, rotating-QR student check-in with schedule and history, absence messages; see CLAUDE.md). The full MVP is re-planned from what v0 delivers.

### Hosting stages

| Stage | When | Setup | Monthly cost |
| --- | --- | --- | --- |
| 0. Local | v0 Days 1 – 16 (until Nov 28) | Docker Compose on your laptop; CI on GitHub Actions, free for public repos | $0 |
| 1. Free demo | From v0 Day 17 (Nov 29) until the first paying center | Cloudflare Pages for the web app, Render free web service for the API and worker, Neon free PostgreSQL, Cloudflare R2 for files | $0 |
| 2. One VPS | The first paying center | Docker Compose with Caddy, PostgreSQL with pg-boss, off-server backups | €5 – 15 server, $1 – 5 backup storage, about $10 – 15 a year for the domain |
| 3. Split | When the scaling path in tech.md#architecture says so | Database and worker on their own servers, more API replicas | Grows with paying customers |

### Free-tier setup (stage 1)

| Part | Service | Free limit | How Dafter fits it |
| --- | --- | --- | --- |
| Web app | Cloudflare Pages | Static hosting | Only API calls reach Render, which protects its bandwidth |
| API and worker | Render free web service | Sleeps after 15 minutes idle; 750 hours a month; 5 GB bandwidth | One process runs the API and the pg-boss worker. An uptime monitor pings `/health` every 10 minutes; a 31-day month is 744 hours, so one service fits. Read Render's current terms before relying on this. |
| Database | Neon free PostgreSQL | 0.5 GB per branch; about 100 compute hours a month; scales to zero | Never pinged, so it sleeps when idle. The first query after idle takes about 500 ms, so open the session a minute before class to warm it up. |
| Files | Cloudflare R2 | 10 GB | Logos and imports go here; nothing is written to Render's disk, which is wiped on restart |
| Messages | Console adapter, the WhatsApp Cloud API test number, and a free-tier email service for student login codes | The test number reaches a few verified phones | Enough for a live demo to a center owner; real WhatsApp messages are paid |

**Design choices this forces, kept in every stage:**

- **pg-boss instead of Redis and BullMQ.** Upstash's free Redis allows 10,000 commands a day, and BullMQ polls Redis constantly. pg-boss keeps jobs in PostgreSQL and workers claim them with `SKIP LOCKED`: one database for data and jobs.
- **Receipts as print-ready HTML pages** that the browser saves as PDF. The browser shapes Arabic perfectly, and a 512 MB server never has to run Chromium.
- **No files on the server;** everything lives in PostgreSQL or R2.
- **Cache and rate limits in process** until there is more than one API replica.

**Never on free tiers: a paying center's real data.** A wake-up delay, a limit hit mid-month, or a quietly changed free-tier rule would break the reliability promise, and you would have no backups you control.

### Choosing a VPS (stage 2)

- **Hetzner is no longer the automatic pick.** Prices rose twice in 2026; the CX23 went from €2.99 to €5.49, and the cost-optimized plans could not be ordered in autumn 2026. Since June 26, 2026, Hetzner has also limited new cloud servers for new customers.
- Compare OVH, Netcup, Contabo and DigitalOcean on the day you buy; prices are moving fast.
- **Oracle Cloud Always Free** gives an always-on Arm server (2 OCPUs, 12 GB) that fits the whole Docker Compose stack, but it needs a card and phone, and idle instances can be reclaimed after 7 days under 20% use. Good for a staging server, not for customers.
- **GitHub Student Pack:** the DigitalOcean credit ended on July 31, 2026. The hosting offers still in the pack are the Azure credit and a Heroku credit of $13 a month for 24 months.
- **Hostinger:** only its VPS plans fit (its shared web hosting cannot run Docker, PostgreSQL and NestJS). KVM 2 (2 vCPU, 8 GB, 100 GB NVMe) is about $8.99 a month on promo and renews at about $14.99; compare renewal prices, not promo prices.
- **AWS:** new accounts get up to $200 in credits on a Free plan that closes after 6 months or when credits run out. Good for a one-time practice deployment, not for hosting Dafter.
- **GoDaddy:** skip for hosting. Buy the domain at Cloudflare Registrar (at cost) or Namecheap.
- **Still open:** the final host is chosen later, before the first paying center. Docker keeps Dafter portable, so the choice changes nothing in the code.

### Running it as a SaaS

The workspace model already makes Dafter multi-tenant, which is the core of a SaaS. What remains is the business layer.

**Business**

- **Plans** priced by number of students or groups, each with a monthly message quota. Set the actual prices from the outreach interviews, not guesses.
- **14-day trial** with a demo workspace already filled with data, so an owner sees value in the first minute.
- **Billing:** at first, collect monthly by InstaPay or Vodafone Cash and activate accounts by hand. Automate with an Egyptian payment gateway in v1.5.
- **Legal:** terms of use, a privacy policy, and compliance with Egypt's Personal Data Protection Law (No. 151 of 2020), since Dafter stores children's and parents' data. Offer data export and deletion on request.
- **Support:** one WhatsApp support number, and a short onboarding call for the first centers.
- **Costs:** one €10 server can host dozens of centers, so two or three paying centers cover hosting. WhatsApp messages are the main cost that grows with use, so either include a quota in each plan or pass the cost through.

**Product and backend to add before the first paying center**

| Item | What it does |
| --- | --- |
| `plans` and `subscriptions` tables | Plan, status (trial, active, past due, suspended), current period end, per workspace |
| Limit guard | Blocks creating students, groups or messages beyond the plan, with a translated upgrade message |
| Usage counters | Messages sent per month, counted from the outbox |
| Super-admin panel (for you) | List workspaces, activate after payment, suspend, and open a read-only support view that is written to the audit log |
| Self-serve signup | Creates a workspace plus a demo center to explore, deletable in one click |
| Data export | CSV export of students, attendance and the ledger per workspace |

### Sources

- [Hetzner Cloud pricing 2026 and CX availability (bitdoze)](https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/)
- [Hetzner Cloud review 2026 (Better Stack)](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/)
- [State of free hosting 2026 (SnapDeploy)](https://snapdeploy.dev/state-of-free-hosting)
- [Free backend hosting 2026 (SnapDeploy)](https://snapdeploy.dev/blog/free-backend-hosting-2026-apis-servers)
- [Best free tiers for developers 2026 (DEV)](https://dev.to/pickuma/best-free-tiers-for-developers-in-2026-saas-paas-iaas-tools-54og)
- [Free tier platforms 2026 list (DEV)](https://dev.to/_6638a39c349d7e9c85ee20/best-free-tier-platforms-for-developer-projects-2026-the-ultimate-list-4pf8)
- [GitHub Student Pack 2026 (Capital & Compute)](https://capitalandcompute.net/blog/github-student-developer-pack-2026/)
- [Hostinger VPS plans and renewals 2026](https://www.brandrums.com/blog/host-nodejs-app-hostinger-vps-2026/)
- [AWS Free Tier: $200 credits and 6-month Free plan](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan)

<a id="demo-script"></a>

## Demo video: shot list

Target length is 3–4 minutes, recorded on https://dafter-vert.vercel.app. Use a laptop for the staff screens, set to a phone width of 375 px (DevTools device mode) unless the shot says otherwise. Use a real Android phone for the student, mirrored or filmed.

### Before recording (once)

- [ ] Reset the demo data so nobody else's edits show up (see `docs/operations.md#deploy` → "Demo accounts and resetting the data").
- [ ] Prepare one student phone. As the owner, open a student → create the activation link → open it on the phone → install the app → log in inside the installed app with the emailed code → the phone binds. This takes a few minutes, so don't film it. Mention it in one line in shot 4.
- [ ] Make sure that student is enrolled in a group with a session **today**. If there isn't one, move a session to today on the timetable.
- [ ] Record between **08:00 and 22:00 Cairo time**. Outside those hours, quiet hours hold the absence message until 08:00, and shot 7 shows nothing.
- [ ] Open the API once beforehand, so the video doesn't start with a cold start.
- [ ] Use two browser profiles: owner and teacher (sign in as `01000000002`).

### Shots

| # | Screen | Show | Say (one line) | ~s |
|:--|:--|:--|:--|--:|
| 1 | `/login` (Arabic, RTL) | Owner signs in with `01000000001` | "Dafter, Arabic-first, for tutoring centers in Egypt." | 15 |
| 2 | Home → workspace | The center name and the owner role. Switch workspace once if you like | "Each center is its own workspace, isolated in the database with RLS." | 15 |
| 3 | `/timetable` | The Saturday-first week and today's sessions. Optionally move or cancel a session that isn't the demo one | "Sessions are generated four weeks ahead from the group's weekly slots, in Cairo time." | 25 |
| 4 | Teacher profile → today's session → Start → `/sessions/:id/live` | The full-screen QR. Let it rotate once (10 s) | "The code changes every 10 seconds, so a photo sent to a friend doesn't work." | 20 |
| 5 | Student phone → installed app → Scan | Point the camera at the laptop's QR. The confirmation appears on the phone | "The student's phone signs each scan with a key that never leaves it." | 20 |
| 6 | Teacher's live screen | The student appears in the live list within about a second | "Check-ins show up live on the teacher's screen." | 10 |
| 7 | Live screen → Close (two taps) → `/dev/phone` | Everyone who didn't scan is marked absent. The parent's Arabic message is on the fake phone. Point out that a pair of siblings gets one message | "Closing marks absences and writes the parent message in the same transaction." | 25 |
| 8 | `/messages` | The log with statuses and the per-center switches (absence, session change) | "Each message is sent once, with quiet hours, and the center can switch each type off." | 15 |
| 9 | `/students/:id` → fees card | The balance, then record a payment → print-ready `/receipts/:id` | "Fees go into an append-only ledger in piastres. Mistakes are reversed, never edited." | 30 |
| 10 | Language switch → English | The same screen in English, left to right. Optionally open the timetable again | "Every screen works in Arabic and English, on a phone." | 15 |
| 11 | README / GitHub (optional) | The architecture diagram and the test numbers | "NestJS, React, PostgreSQL with RLS, tested with Testcontainers and Playwright." | 10 |

### Tips

- Turn off notifications. Zoom the browser so the text is readable in the video.
- If a scan fails on camera, cut and retake. Don't explain the failure in the video.
- Keep the student's real email out of the shot.
