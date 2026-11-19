# Product

What Dafter is and the plan to get there: vision, roles, MVP modules, open questions, then the agile plan (sprints, releases, risks).

## Contents

1. [Product & plan](#product) (was `docs/product.md`)
2. [Agile plan](#agile-plan) (was `docs/agile-plan.md`)

<a id="product"></a>

## Dafter (دفتر) — Product & Technical Plan

Nov 10, 2026 · @ziad

### Vision

Dafter is a bilingual (Arabic/English) web app that lets Egyptian tutoring centers and independent teachers run groups, take attendance in seconds, track fees, record grades, and keep parents informed automatically.

**The problem today.** Most سناتر and private teachers run on paper notebooks, Excel sheets, and WhatsApp groups. Attendance is called out by name, so it eats the first 10 minutes of a 200-student session. Nobody knows who owes this month's fee until the end of the month. Parents only find out their child skipped class when results come out.

**What Dafter does differently.**

- **Door-speed attendance.** The teacher shows a QR code that changes every 10 seconds, and each student scans it with the Dafter app on their own phone. Whoever did not check in is marked absent when the session closes.
- **Parents hear about it the same day.** An absence, an unpaid fee, or a grade triggers a short message to the parent in their language.
- **Built for how the market actually works.** A teacher can teach in two centers and also run private groups at home. Each place stays its own workspace, and the teacher switches between them.
- **Arabic first, not translated later.** Full RTL layout, Arabic name search that handles أ/ا/إ and ة/ه, and the Egyptian week starting Saturday.

**Why it is a strong portfolio project.** It has real backend problems: multi-tenancy, role-based access, background jobs, a reliable messaging pipeline, and money records that must never be wrong. It is also a product you can demo to the centers you are already reaching out to.

**Name.** Dafter (دفتر, "notebook"). Every center runs on a paper دفتر today; Dafter is that notebook, made reliable and automatic.

### Top priorities

Simple, fast, reliable, and ready for traffic come before any new feature. Each one has a measurable budget, and the build fails or the release stops when a budget is broken.

| Priority | Budget | How it is kept |
| --- | --- | --- |
| Simple | Daily actions (scan, register, record payment) take 3 taps or fewer; registering a student takes under 20 seconds | One main action per screen, smart defaults, plain Egyptian Arabic wording, a usability test with 3 real assistants at the end of every phase |
| No felt latency | A student sees the check-in confirmed within 300 ms of scanning; the teacher's live list updates within 1 second | The teacher's screen generates the rotating QR locally; a check-in is one indexed lookup and one insert; check-ins reach the teacher's screen over server-sent events |
| Fast API | p95 under 150 ms for reads and under 250 ms for writes, measured on the server | Indexes on every `workspace_id` query, an in-process cache for today's sessions and rosters, heavy work moved to the worker |
| Fast app | First load under 2.5 s (LCP) on a mid-range Android phone on 4G; initial JavaScript under 200 KB gzipped | Route-level code splitting, prefetching the next screen, skeletons instead of spinners, Lighthouse CI budgets |
| Reliable | 99.9% uptime; zero lost scans; zero duplicate messages or payments; at most 5 minutes of data lost in a disaster | Idempotent writes, the transactional outbox, continuous WAL backups with pgBackRest, zero-downtime deploys, external uptime alerts |
| Handles traffic | 50 scans per second sustained and 300 concurrent users on one 4 vCPU / 8 GB server | Stateless API that can run as 2+ replicas behind Caddy, PgBouncer once connections grow, rate limits, cursor pagination, k6 load tests before each release |

When a feature and a budget conflict, the budget wins and the feature waits. The budgets are the v1.0 targets for production on a VPS. The v0 due November 30 meets the simplicity and correctness targets; the infrastructure items come after it, and the free demo stage has cold starts by design.

### Users, roles and tenancy

Every account lives inside a **workspace**, and a workspace is either a **center** or an **independent teacher**. One person can belong to several workspaces with a different role in each.

**Example.** Mr. Ahmed teaches physics at Center A and Center B, and runs two private groups at home. He has one login and three workspaces: a teacher in A, a teacher in B, and the owner of his own independent workspace. Data never leaks between them.

| Role | Exists in | Can do | Cannot do |
| --- | --- | --- | --- |
| Owner | Center or independent workspace | Everything: members, rooms, settings, all groups, all money reports | — |
| Teacher | Center workspace | Manage own groups, students in them, grades, fees for own groups | See other teachers' groups or the center's money |
| Assistant | Any workspace, assigned to one or more teachers | Take attendance, register students, record payments for assigned teachers' groups | Change fee plans, delete records, see reports outside their scope |

**Who does not log in (v1).** Parents. A parent has a phone number and a preferred language, and receives messages; a parent portal is a later phase. Students do log in: each student has a Dafter account in an app installed from a link to their own phone's home screen (no app store), signs in with a one-time code sent by WhatsApp or email, and uses it to check in, see their schedule, and see their attendance history. Grades and balance come later, with the fees and exams modules.

**Key rules.**

- A student record belongs to one workspace. The same child at two centers is two separate records, on purpose, for privacy, both linked to one student login, so the student uses one app while each center sees only its own record. A student account is bound to one phone; an assistant can reset it when the student changes phones.
- Inside a workspace, one student can join many groups (physics with one teacher, chemistry with another).
- An independent teacher's workspace has no rooms and no other teachers; it is a center with one teacher.
- Every write is recorded in an audit log: who did it, when, and from which workspace.

### MVP features

The full MVP (v1.0) has seven modules; the v0 due November 30 is a lean subset of modules 1, 2, 3, 4 and 7 (see the Build instructions tab). Each one ends with acceptance criteria that become end-to-end tests (see the Testing & CI/CD tab).

#### 1. Accounts and workspaces

Sign up with phone or email and a password, create a center or independent workspace, invite teachers and assistants by link, switch workspaces from the header.

- [x] An invited assistant who opens the link joins with the role and teachers chosen in the invite. (Done Nov 15, Limits Batch 3.)
- [x] A user in two workspaces only ever sees data from the one currently selected.

#### 2. Groups and schedules

A group has a subject, a grade level (for example ٣ ثانوي), a teacher, weekly time slots, an optional room, a capacity, and a fee plan. Sessions are generated from the weekly slots 4 weeks ahead. A single session can be cancelled or moved without touching the rest.

- [x] Two groups cannot be booked in the same room at overlapping times.
- [x] Cancelling a session notifies the parents of every enrolled student.

#### 3. Students and enrollment

Add a student in under 20 seconds at the door: name, phone, parent phone, grade level. Enroll them in one or more groups with an optional discount. Send the student an invite to activate the Dafter app.

- [x] Searching "احمد" finds "أحمد", and "فاطمه" finds "فاطمة".
- [x] A duplicate warning appears when the phone number already exists in the workspace.

#### 4. QR attendance

The teacher opens today's session on a laptop, tablet, or phone and shows a QR code that changes every 10 seconds. Each student scans it in the Dafter app on their own phone and sees an instant confirmation, while the teacher watches a live list fill up. The assistant ticks students without a phone as present from that list. Closing the session marks everyone else absent.

- [x] A student who scans twice gets one attendance, not two.
- [x] A student from another group of the same teacher is recorded as a make-up (حصة تعويضية), not an error.
- [x] A photo of the QR older than about 20 seconds is rejected, and one phone can check in only one student account.

#### 5. Fees and payments

Fee plans: monthly, per session, or a package of N sessions. Record payments in cash, Vodafone Cash, or InstaPay with a receipt number. Partial payments are allowed. Each assistant gets an end-of-day cash summary to hand over.

- [x] A student's balance always equals charges minus payments, computed from records, never stored as a free-typed number.
- [x] A payment is never deleted; a mistake is fixed with a reversal entry that keeps the history.

#### 6. Exams and grades

Create an exam for a group with a maximum score, enter scores in a fast grid, mark students absent from the exam, and send results to parents in one action.

- [x] A score above the maximum is rejected with a translated error.

#### 7. Parent messaging

Automatic messages for: absence, session cancelled, fee overdue, and exam result. Each workspace switches every trigger on or off and edits its Arabic and English templates. A message log shows each message's delivery status.

- [x] Closing a session sends exactly one absence message per absent student's parent, even if the close button is pressed twice.
- [x] Siblings absent from the same session produce one combined message to their shared parent.
- [x] No automatic messages are sent between 10 PM and 8 AM; they wait until morning.

**Out of scope for the MVP:** a parent portal, student grades and balance, online payments, a native mobile app, full offline mode, and room-rent settlement between centers and teachers.

### Roadmap

Build in six phases, and finish each one deployed and demo-able, so the portfolio link is live from Phase 0 onward.

&#91;embedded content: roadmap · 6 phases, 2 gates\]

Phase 2 is the heart of the project: attendance plus a reliable message pipeline is the story you tell in interviews. The v0 due November 30 builds a lean version of Phases 0 to 2 and doubles as the demo for center interviews; the answers to the open questions below gate the full Phase 2 and the fee model in Phase 3.

### Open questions

Ask these to 3 to 5 centers during your outreach, showing them the v0 demo, before building fees. The answers can change the data model, so they are cheaper to settle now than after the code exists.

- [ ] Do centers collect the fee, or does each teacher collect for their own groups? This decides who owns the ledger and whether room rent belongs in v1.
- [ ] Is the fee usually monthly per group, per session, or a package? Are sibling discounts common?
- [ ] Does each teacher have a laptop, tablet, or phone to show the rotating QR during the session?
- [ ] What share of students have a smartphone with internet at the center, and do centers allow phones in class?
- [ ] Do parents expect WhatsApp, SMS, or both? Would a center pay a small amount per message?
- [ ] Is "late" tracked today, and after how many minutes does a student count as late?

### The other tabs

- Architecture & stack: the stack, how frontend and backend stay in sync, repo layout, multi-tenancy, auth.
- Data model & API: every table, the money rules, and the REST endpoints.
- Bilingual & messaging: RTL and Arabic details, and the parent messaging pipeline.
- Testing & CI/CD: the test layers, critical scenarios, and the PR and release pipelines.
- Agile plan: how you work, Definition of Done, and every sprint to MVP and beyond, with dates.
- Hosting & SaaS: how big the project really is, hosting stages from $0 to a VPS, the free-tier setup, and running Dafter as a SaaS.
- Build instructions (CLAUDE.md): the CLAUDE.md for Claude Code, with the day-by-day v0 plan, rules, and project skills.

<a id="agile-plan"></a>

## Agile plan

The MVP (v1.0) ships after 9 two-week sprints, on March 19, 2027, followed by five releases of two sprints each through August 2027. This assumes about 20 hours a week and a start on Saturday, November 14, 2026; move the dates if your hours change.

**Update:** a v0 sprint now comes first, November 13 to 30, at about 10 hours a day (day-by-day tasks in `CLAUDE.md` and `docs/progress.md`). It covers most of Sprints 0 to 5 in lean form, so after v0 these sprints will be re-planned from what is actually done; treat the dates below as the old baseline.

### How you work

A solo version of Scrum: fixed two-week sprints with a Kanban board inside each one.

- **Board:** GitHub Projects linked to Issues and PRs. Columns: Backlog, Ready, In progress (limit 2), In review, Done.
- **Sprint planning (Saturday, 1 hour):** pick stories from the top of the backlog up to your average velocity, and write the sprint goal in one sentence.
- **Daily note (5 minutes):** what you did, what is next, what is blocking. One line each, in the sprint issue.
- **Sprint review (Friday):** deploy (free-tier demo, later staging) and record a 2-minute demo video. These videos become your portfolio and outreach material.
- **Retro (15 minutes):** three lines in `docs/retros/sprint-N.md`: keep, stop, try.
- **Estimates:** story points 1, 2, 3, 5, 8. Anything bigger is split. Velocity is tracked from Sprint 2 and used for planning from Sprint 4.
- **Capacity rule:** 20% of every sprint goes to quality and operations (performance, security, bugs, tests), so the top priorities never wait for a "hardening sprint".

**Story format:** "As a student, I want to scan the teacher's QR, so that my attendance takes one second." Each story lists its acceptance criteria from the Product tab.

### Definition of Ready

- [ ] Acceptance criteria are written and testable.
- [ ] The screen is sketched (even on paper) in Arabic, RTL.
- [ ] API changes are written as Zod schemas first.
- [ ] Estimated at 8 points or fewer.

### Definition of Done

- [ ] Unit, integration and, for user flows, end-to-end tests pass in CI.
- [ ] Works in Arabic (RTL) and English, checked on a phone-sized screen.
- [ ] Performance budgets from the Product tab still pass (Lighthouse CI, p95 checks).
- [ ] Tenant isolation tests cover any new endpoint.
- [ ] Deployed (to the free-tier demo from v0 on; to staging from the VPS stage) and shown in the sprint demo.
- [ ] Docs, ADRs and the changelog are updated when something changed.

### Epics

| Epic | Covers |
| --- | --- |
| E1 Foundations | Monorepo, CI, Docker, deploy, design system, i18n shell |
| E2 Accounts and workspaces | Auth, workspaces, memberships, invites, tenant isolation |
| E3 Groups and schedules | Subjects, levels, rooms, groups, slots, sessions |
| E4 Students | Students, guardians, Arabic search, enrollment, student accounts and phone binding |
| E5 Attendance | Rotating session QR, student check-in, live list, manual marking, session close, make-ups |
| E6 Messaging | Outbox, worker, templates, providers, message log |
| E7 Fees | Fee plans, ledger, payments, receipts, reports |
| E8 Exams | Exams, score grid, results to parents |
| E9 Dashboard | Today view for owners and teachers |
| E10 Quality and operations | Performance, reliability, security, observability; runs in every sprint |

### Sprints to MVP

| Sprint | Dates | Goal | Main stories | Demo | Status |
| --- | --- | --- | --- | --- | --- |
| 0 | Nov 14 – Nov 27 | A deployed "hello" app with the full pipeline | Monorepo, Docker Compose, Drizzle setup, CI with all 7 checks, VPS with staging and production, design tokens, AR/EN shell with RTL | Merging a PR deploys to staging automatically | Done (Nov 13) on Vercel Hobby + Neon, not a VPS; no staging environment |
| 1 | Nov 28 – Dec 11 | Secure multi-tenant accounts | Register, login, refresh rotation, workspaces, invites, workspace switch, tenant guard, RLS, isolation test suite | Two users, two workspaces, no leaks | Done (Nov 13) |
| 2 | Dec 12 – Dec 25 | A real weekly timetable | Subjects and levels seed, rooms, groups, slots, session generation, room conflict check, timetable screen | A center's full week on screen | Done (rooms and the conflict check Nov 15) |
| 3 | Dec 26 – Jan 8 | Students in under 20 seconds | Students, guardians, Arabic search, enrollment, student invites and email login codes; interview 3 to 5 centers (open questions) | Register and enroll at "the door" | Done (Nov 13); center interviews not held yet |
| 4 | Jan 9 – Jan 22 | Door-speed attendance | Rotating session QR, student check-in with device keys, live list, manual marking, close session, make-ups | 30 phones check in from one rotating QR | Done (Nov 13) |
| 5 | Jan 23 – Feb 5 | Parents hear about it | Outbox, relay, worker, console adapter, templates AR/EN, quiet hours, message log, WhatsApp adapter in test mode | Close a session, the parent's "fake phone" buzzes | Done except the WhatsApp test-mode adapter (editable templates Nov 15) |
| 6 | Feb 6 – Feb 19 | Money that is never wrong | Fee plans, charge job, ledger, payments with idempotency, reversals, receipt PDF, cash summary, unpaid report | Pay, reverse, pay again; totals match | Done for monthly fees (cash summary Nov 15); per-session and package plans wait on the interviews; receipts are print-ready HTML (rule 12), not PDF |
| 7 | Feb 20 – Mar 5 | Grades and the owner's day | Exams, score grid, results to parents, today dashboard | Owner sees today in one screen | Done (Nov 15) |
| 8 | Mar 6 – Mar 19 | Release v1.0 | k6 at target load, security review (OWASP top 10), restore drill, onboarding flow, demo seed, README, landing page, pilot center onboarding | Live link and a 3-minute product video | Partly: demo seed, README and live link done (v0.1.0); k6, security review, restore drill, onboarding, landing page, pilot not started |

### After the MVP

| Release | Sprints | Dates | Goal | Status |
| --- | --- | --- | --- | --- |
| v1.1 Pilot hardening | 9 – 10 | Mar 20 – Apr 16 | Fix what the pilot center reports; usability tests with their assistants; tune budgets on real traffic | Not started |
| v1.2 Staff install and offline | 11 – 12 | Apr 17 – May 14 | Installable staff app (students already have one from v0), WhatsApp login codes, offline payments queue | Not started |
| v1.3 Parent portal | 13 – 14 | May 15 – Jun 11 | Parents log in with a one-time code and see attendance, balance and grades; students also see their grades and balance | Not started |
| v1.4 Center finance | 15 – 16 | Jun 12 – Jul 9 | Room rent and revenue share between centers and teachers, monthly statements | Not started |
| v1.5 Online payments | 17 – 18 | Jul 10 – Aug 6 | Pay fees online through an Egyptian payment gateway; OTP login for staff | Not started |

**Later backlog, unordered:** a React Native app, multi-branch centers, analytics on attendance and dropout, a public API, an Arabic voice note for absence messages.

### Risks to the schedule

- **Ramadan (about Feb 8 – Mar 9, 2027)** overlaps Sprints 6 to 8, and centers shift sessions to after iftar. Plan those sprints at 70% of normal velocity, and test that late-night sessions still respect quiet hours.
- **WhatsApp template approval** can take days. Submit templates at the start of Sprint 5, not the end; the console adapter keeps work moving meanwhile.
- **Open questions change the model.** If the center interviews in Sprint 3 show that teachers, not centers, collect fees, adjust the ledger design before Sprint 6.
- **Scope creep from the pilot.** New requests go to the backlog and are only pulled into v1.1 or later, never into the running sprint.
