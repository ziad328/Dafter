# Hosting & SaaS

Dafter costs $0 until the first center pays: build locally, demo on free tiers, then move to one €5–15/month VPS that the first customer's subscription pays for. Traffic stays small for a long time; correctness and scope are the real challenges, not scale.

## How big is it, really?

A center with 200 students arriving within 10 minutes produces about 0.3 scans per second. Even 100 such centers starting sessions at the same minute stay under 35 scans per second, inside the 50-per-second budget of one small server.

**Needed from day one (correctness):** tenant isolation, idempotent scans, secure rotating-QR check-in with phone binding, the outbox for messages, the money ledger, tests, and backups. This is the "real backend" work interviewers care about.

**Postponed until real load (scale):** multiple API replicas, PgBouncer, Prometheus and Grafana, Redis, read replicas, and nightly load tests. Run k6 once for the README; add the rest when monitoring shows a need.

**Why not Supabase + Vercel.** With Supabase, the database, auth, row-level security, file storage, and API are generated for you, so the backend is small. That ships faster, but it hides exactly the skills this project exists to show. Dafter keeps its own NestJS backend; a host such as Render or Neon only runs your code and your database, which is different.

**Scope is the real risk.** Seven modules in nine sprints is a lot for one person.

- [x] Decided: a lean v0 ships first, November 13 to 30 (accounts, groups and sessions, students, rotating-QR student check-in with schedule and history, absence messages; see CLAUDE.md). The full MVP is re-planned from what v0 delivers.

## Hosting stages

| Stage | When | Setup | Monthly cost |
| --- | --- | --- | --- |
| 0. Local | v0 Days 1 – 16 (until Nov 28) | Docker Compose on your laptop; CI on GitHub Actions, free for public repos | $0 |
| 1. Free demo | From v0 Day 17 (Nov 29) until the first paying center | Cloudflare Pages for the web app, Render free web service for the API and worker, Neon free PostgreSQL, Cloudflare R2 for files | $0 |
| 2. One VPS | The first paying center | Docker Compose with Caddy, PostgreSQL with pg-boss, off-server backups | €5 – 15 server, $1 – 5 backup storage, about $10 – 15 a year for the domain |
| 3. Split | When the scaling path in architecture.md says so | Database and worker on their own servers, more API replicas | Grows with paying customers |

## Free-tier setup (stage 1)

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

## Choosing a VPS (stage 2)

- **Hetzner is no longer the automatic pick.** Prices rose twice in 2026; the CX23 went from €2.99 to €5.49, and the cost-optimized plans could not be ordered in autumn 2026. Since June 26, 2026, Hetzner has also limited new cloud servers for new customers.
- Compare OVH, Netcup, Contabo and DigitalOcean on the day you buy; prices are moving fast.
- **Oracle Cloud Always Free** gives an always-on Arm server (2 OCPUs, 12 GB) that fits the whole Docker Compose stack, but it needs a card and phone, and idle instances can be reclaimed after 7 days under 20% use. Good for a staging server, not for customers.
- **GitHub Student Pack:** the DigitalOcean credit ended on July 31, 2026. The hosting offers still in the pack are the Azure credit and a Heroku credit of $13 a month for 24 months.
- **Hostinger:** only its VPS plans fit (its shared web hosting cannot run Docker, PostgreSQL and NestJS). KVM 2 (2 vCPU, 8 GB, 100 GB NVMe) is about $8.99 a month on promo and renews at about $14.99; compare renewal prices, not promo prices.
- **AWS:** new accounts get up to $200 in credits on a Free plan that closes after 6 months or when credits run out. Good for a one-time practice deployment, not for hosting Dafter.
- **GoDaddy:** skip for hosting. Buy the domain at Cloudflare Registrar (at cost) or Namecheap.
- **Still open:** the final host is chosen later, before the first paying center. Docker keeps Dafter portable, so the choice changes nothing in the code.

## Running it as a SaaS

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

## Sources

- [Hetzner Cloud pricing 2026 and CX availability (bitdoze)](https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/)
- [Hetzner Cloud review 2026 (Better Stack)](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/)
- [State of free hosting 2026 (SnapDeploy)](https://snapdeploy.dev/state-of-free-hosting)
- [Free backend hosting 2026 (SnapDeploy)](https://snapdeploy.dev/blog/free-backend-hosting-2026-apis-servers)
- [Best free tiers for developers 2026 (DEV)](https://dev.to/pickuma/best-free-tiers-for-developers-in-2026-saas-paas-iaas-tools-54og)
- [Free tier platforms 2026 list (DEV)](https://dev.to/_6638a39c349d7e9c85ee20/best-free-tier-platforms-for-developer-projects-2026-the-ultimate-list-4pf8)
- [GitHub Student Pack 2026 (Capital & Compute)](https://capitalandcompute.net/blog/github-student-developer-pack-2026/)
- [Hostinger VPS plans and renewals 2026](https://www.brandrums.com/blog/host-nodejs-app-hostinger-vps-2026/)
- [AWS Free Tier: $200 credits and 6-month Free plan](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan)
