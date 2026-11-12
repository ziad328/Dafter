# Agile plan

The MVP (v1.0) ships after 9 two-week sprints, on March 19, 2027, followed by five releases of two sprints each through August 2027. This assumes about 20 hours a week and a start on Saturday, November 14, 2026; move the dates if your hours change.

**Update:** a v0 sprint now comes first, November 13 to 30, at about 10 hours a day (day-by-day tasks in `CLAUDE.md` and `docs/progress.md`). It covers most of Sprints 0 to 5 in lean form, so after v0 these sprints will be re-planned from what is actually done; treat the dates below as the old baseline.

## How you work

A solo version of Scrum: fixed two-week sprints with a Kanban board inside each one.

- **Board:** GitHub Projects linked to Issues and PRs. Columns: Backlog, Ready, In progress (limit 2), In review, Done.
- **Sprint planning (Saturday, 1 hour):** pick stories from the top of the backlog up to your average velocity, and write the sprint goal in one sentence.
- **Daily note (5 minutes):** what you did, what is next, what is blocking. One line each, in the sprint issue.
- **Sprint review (Friday):** deploy (free-tier demo, later staging) and record a 2-minute demo video. These videos become your portfolio and outreach material.
- **Retro (15 minutes):** three lines in `docs/retros/sprint-N.md`: keep, stop, try.
- **Estimates:** story points 1, 2, 3, 5, 8. Anything bigger is split. Velocity is tracked from Sprint 2 and used for planning from Sprint 4.
- **Capacity rule:** 20% of every sprint goes to quality and operations (performance, security, bugs, tests), so the top priorities never wait for a "hardening sprint".

**Story format:** "As a student, I want to scan the teacher's QR, so that my attendance takes one second." Each story lists its acceptance criteria from the Product tab.

## Definition of Ready

- [ ] Acceptance criteria are written and testable.
- [ ] The screen is sketched (even on paper) in Arabic, RTL.
- [ ] API changes are written as Zod schemas first.
- [ ] Estimated at 8 points or fewer.

## Definition of Done

- [ ] Unit, integration and, for user flows, end-to-end tests pass in CI.
- [ ] Works in Arabic (RTL) and English, checked on a phone-sized screen.
- [ ] Performance budgets from the Product tab still pass (Lighthouse CI, p95 checks).
- [ ] Tenant isolation tests cover any new endpoint.
- [ ] Deployed (to the free-tier demo from v0 on; to staging from the VPS stage) and shown in the sprint demo.
- [ ] Docs, ADRs and the changelog are updated when something changed.

## Epics

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

## Sprints to MVP

| Sprint | Dates | Goal | Main stories | Demo | Status |
| --- | --- | --- | --- | --- | --- |
| 0 | Nov 14 – Nov 27 | A deployed "hello" app with the full pipeline | Monorepo, Docker Compose, Drizzle setup, CI with all 7 checks, VPS with staging and production, design tokens, AR/EN shell with RTL | Merging a PR deploys to staging automatically | Not started |
| 1 | Nov 28 – Dec 11 | Secure multi-tenant accounts | Register, login, refresh rotation, workspaces, invites, workspace switch, tenant guard, RLS, isolation test suite | Two users, two workspaces, no leaks | Not started |
| 2 | Dec 12 – Dec 25 | A real weekly timetable | Subjects and levels seed, rooms, groups, slots, session generation, room conflict check, timetable screen | A center's full week on screen | Not started |
| 3 | Dec 26 – Jan 8 | Students in under 20 seconds | Students, guardians, Arabic search, enrollment, student invites and email login codes; interview 3 to 5 centers (open questions) | Register and enroll at "the door" | Not started |
| 4 | Jan 9 – Jan 22 | Door-speed attendance | Rotating session QR, student check-in with device keys, live list, manual marking, close session, make-ups | 30 phones check in from one rotating QR | Not started |
| 5 | Jan 23 – Feb 5 | Parents hear about it | Outbox, relay, worker, console adapter, templates AR/EN, quiet hours, message log, WhatsApp adapter in test mode | Close a session, the parent's "fake phone" buzzes | Not started |
| 6 | Feb 6 – Feb 19 | Money that is never wrong | Fee plans, charge job, ledger, payments with idempotency, reversals, receipt PDF, cash summary, unpaid report | Pay, reverse, pay again; totals match | Not started |
| 7 | Feb 20 – Mar 5 | Grades and the owner's day | Exams, score grid, results to parents, today dashboard | Owner sees today in one screen | Not started |
| 8 | Mar 6 – Mar 19 | Release v1.0 | k6 at target load, security review (OWASP top 10), restore drill, onboarding flow, demo seed, README, landing page, pilot center onboarding | Live link and a 3-minute product video | Not started |

## After the MVP

| Release | Sprints | Dates | Goal | Status |
| --- | --- | --- | --- | --- |
| v1.1 Pilot hardening | 9 – 10 | Mar 20 – Apr 16 | Fix what the pilot center reports; usability tests with their assistants; tune budgets on real traffic | Not started |
| v1.2 Staff install and offline | 11 – 12 | Apr 17 – May 14 | Installable staff app (students already have one from v0), WhatsApp login codes, offline payments queue | Not started |
| v1.3 Parent portal | 13 – 14 | May 15 – Jun 11 | Parents log in with a one-time code and see attendance, balance and grades; students also see their grades and balance | Not started |
| v1.4 Center finance | 15 – 16 | Jun 12 – Jul 9 | Room rent and revenue share between centers and teachers, monthly statements | Not started |
| v1.5 Online payments | 17 – 18 | Jul 10 – Aug 6 | Pay fees online through an Egyptian payment gateway; OTP login for staff | Not started |

**Later backlog, unordered:** a React Native app, multi-branch centers, analytics on attendance and dropout, a public API, an Arabic voice note for absence messages.

## Risks to the schedule

- **Ramadan (about Feb 8 – Mar 9, 2027)** overlaps Sprints 6 to 8, and centers shift sessions to after iftar. Plan those sprints at 70% of normal velocity, and test that late-night sessions still respect quiet hours.
- **WhatsApp template approval** can take days. Submit templates at the start of Sprint 5, not the end; the console adapter keeps work moving meanwhile.
- **Open questions change the model.** If the center interviews in Sprint 3 show that teachers, not centers, collect fees, adjust the ledger design before Sprint 6.
- **Scope creep from the pilot.** New requests go to the backlog and are only pulled into v1.1 or later, never into the running sprint.
