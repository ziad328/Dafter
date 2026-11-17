# Known limits and open issues

Everything we know is missing, unchecked or a deliberate shortcut, in one place. Sources: the "Left:" notes in `progress.md`, `shortcut:` comments in the code, and the session reports and reviews from Days 1–15. Fixed items are removed; new ones are added by the `task-finish` skill. The order to fix them in is `docs/limits-plan.md`.

**Fix by:** **D17** = Day 17 deploy · **v0** = before the v0 tag (Nov 30) · **centers** = before a real center uses it · **later** = when scale or a real need shows up.

## Deploy and infrastructure

| Limit | Impact | Fix by |
|:--|:--|:--|
| The demo runs on Vercel Hobby: personal, non-commercial use only; 4 active CPU-hours a month; functions end after 300 s | Fine for the demo; a paying center needs a paid host or a VPS | centers |
| No always-on worker on Vercel: messages leave right after their write (`OUTBOX_SEND_INLINE`); held ones go at the 08:00 Cairo daily cron; retries wait for the hourly cron-job.org call (optional) | A failed send can wait up to an hour (or a day without cron-job.org) | centers (VPS with pg-boss) |
| CI's `migrate` job applies migrations to Neon after the tests on `main`; Vercel waits for it only if its Deployment Checks require that check (a dashboard setting). Until promotion the old code runs on the new schema | A migration must only add (drop in a later push); without the Deployment Check, a build can go live before its migration | — (documented in `deploy.md`) |
| The live list polls the database every second per open teacher screen | Up to 1 s delay; Neon stays awake while a class is live | later (LISTEN/NOTIFY on a long-running host) |
| The first request after a quiet spell starts NestJS (cold start) | About 1–2 s wait | — |
| The `oasdiff` breaking-change check ignores new error codes (the web shows `errors.INTERNAL` for one it doesn't know), and a commit with a `BREAKING CHANGE` footer skips it | An old PWA shows a generic error for a new code until it updates | — |
| Rate limits (login, codes, check-ins: 10 a minute per phone, 300 per session) are rows in PostgreSQL (`rate_limits`, since Nov 17) | Shared by every instance and kept across restarts; the cost is one or two small queries per login and scan, and a fixed window lets up to twice the limit through around a window edge | later (Redis or a sliding window only if those queries show up in latency) |
| Every job loops over all workspaces in one pass (sessions, charges, outbox) | Slow with thousands of workspaces | later |
| Test harness: cloned test databases are never dropped, and the global setup always starts a container | Slower local runs only | later |

## Auth and accounts

| Limit | Impact | Fix by |
|:--|:--|:--|
| The demo's staff password is public (`dafter-dev-123`) | Anyone can change demo data; reseed with `pnpm demo:seed:neon` | — (demo only) |
| Brevo's free tier sends from one verified address and has a daily cap | Login codes stop for the day if the cap is hit | centers (own domain) |
| Register limit skips loopback (`127.0.0.1`) so local tools and tests can sign up freely | None in production (clients are never loopback behind Vercel) | — |
| Two tabs refreshing at the same moment log the user out (reuse detection); single-flight only covers one tab | Rare surprise sign-out | later (short grace window if it bites) |
| Routes outside a workspace (sign-in, invite accept, check-in) still write their audit row in its own transaction after the handler | A crash in between loses that row | later |
| A tenant write holds its connection and row locks until the audit row commits; handlers must not run repository calls in parallel (`requestTx` savepoints share one connection) | Slightly longer locks; a rule to keep | — |
| Invites: duplicated token-creation code (staff invite, reset link, student invite) | Three copies of the same 3 lines | later |
| Removing a member doesn't sign them out: their open tabs get 404 on the next request; their refresh tokens still work for their other centers | By design (one account, many centers) | — |
| A removed teacher's groups keep them as teacher (flagged "No teacher") until the owner picks another; their sessions still show their name | The owner must reassign by hand | — |
| `PUT /members/:id/scopes` checks the teachers without a lock: a teacher removed at the same moment can be left in a scope | A stale scope row, removed by the next save | later |
| A phone reset from center A also unbinds it at center B (one shared login) | By design, but surprising | — (documented) |
| Anyone holding an invite link can claim that record (single use, 72 h) | Same trust model as staff invites | — (documented) |
| `DEV_FAKE_PHONE=1` with `DEMO_DEPLOY=1` (the public demo) shows a workspace's sent parent messages, full phones, to all its staff, teachers included. `DEV_MAIL_INBOX` is refused in production at startup | Never set `DEMO_DEPLOY` on a deploy with real users | — (documented) |

## Groups, sessions and students

| Limit | Impact | Fix by |
|:--|:--|:--|
| Rooms: a session generated at a time a moved session already holds in the room gets no room (shown without one) instead of failing | The owner fixes that one session by hand | — |
| Rooms: a session can't be moved to another room on its own; only the group's room changes (for its future sessions) | A one-off room swap means moving the group | later |
| Rooms: a group above the room's seats gets a warning on the form, not an error | The owner decides | — |
| Rooms work in independent workspaces too (the data model said centers only) | Harmless; the screen sits under More for everyone | — |
| Curriculum (subjects, grades) can't be edited | Centers with other subjects are stuck | centers |
| A full group is a confirm, not a hard stop (`force: true` adds anyway) | Staff can still over-fill on purpose | — |
| A teacher clash on a group's slots is a warning the owner can save past (`force`); twin groups saved that way then refuse each other's session moves (`TEACHER_BOOKED`, moves have no force) | Move such a session to a free hour, or save the groups apart | — |
| The teacher check uses each group's current teacher; a past session keeps no teacher of its own | A teacher change re-labels old sessions | — |
| `GET /groups/:id/sessions` not built | Not needed by the timetable | later |
| No cursor pagination (groups, students: first 50) | Big centers can't see everyone | later |
| Teachers see every student in the workspace | Privacy choice not settled | centers |
| The UI handles one guardian per student (the API allows more) | Second parent needs the API | centers |

## Attendance and student app

| Limit | Impact | Fix by |
|:--|:--|:--|
| The QR screen's wake lock needs the Screen Wake Lock API (iOS 16.4+, Chrome 84+); older phones may still dim | Rare on current phones | — |
| A student on a video call can relay the QR | Known weakness of rotating QR (architecture.md) | — (documented) |
| No offline screen when the API is unreachable | The PWA shows errors | later |

## Money

| Limit | Impact | Fix by |
|:--|:--|:--|
| Only monthly fees: no per-session or package-of-N plans (product module 5) | Centers that charge per session can't use the ledger yet | centers (after the interviews) |
| No proration for mid-month joins | A student who joins on the 25th pays the full month | centers |
| No nightly balance check | Drift would go unnoticed (the ledger is append-only) | later |
| Students don't see their balance | Parents ask the center | later |
| Fee model (one monthly fee per group) and who sees money are guesses | May change after center interviews | centers |
| Cash summary: no "handed over" step; the owner can't mark a day as received or see who hasn't handed over | The handover itself is still on paper | centers |
| Cash summary: a reversal counts on the day it was made, so voiding an older payment can make a day's total negative | Shown as is (real money out); can surprise at first | — |
| Cash summary: the owner sees every staff member on one page, with no filter by person or a date range (one day at a time) | Fine for a small center | later |
| Cash summary: checked at 375 px in Playwright only; the printed page / saved PDF and a real phone are not checked by eye | Print layout may need tweaks | centers |
| Cash summary: payments sit under whoever recorded them; one assistant typing in another's takings shows under the wrong person | Rare; fix by reversing and re-entering | — |

## Exams and dashboard (v1)

| Limit | Impact | Fix by |
|:--|:--|:--|
| No CSV import or export of exam scores | Big groups are typed by hand | centers (export first, import later) |
| A corrected score resends the same sentence with «تصحيح:» only | Parents don't see the old score | — |
| Dashboard: 8, 13 or 26 weeks; money is always the last 6 months; no free date range | No custom term dates | later |
| Dashboard: archived groups are left out | Last term's groups disappear | later (include them with a filter) |
| Dashboard bars are plain CSS, no chart library | No tooltips or axis | — |
| The exam grid, "My grades", the dashboard and the fee-reminder switch were checked by the 375 px tests only | Not checked by eye on a real phone | centers |

## Messages (Day 15)

| Limit | Impact | Fix by |
|:--|:--|:--|
| `whatsapp_opt_in` is not checked | Fine with the console adapter; must be checked before WhatsApp | later (with WhatsApp) |
| "Primary guardian only" is one switch for the whole center, not per student | A family that wants both parents texted can't have it while the switch is on | later |
| A late "absent" for a sibling whose guardian was already told about that session sends nothing (one message per guardian per session) | The second child's absence isn't texted | later |
| "Absent" corrected to "present" after the message went out sends nothing (no apology text) | The parent keeps the wrong message | — |
| A late "absent" on a session that ended more than 2 days ago texts nobody | Old fixes are record-keeping only | — |
| The send-time re-check runs one or two queries per row (batches of 50) | Slower sends with big batches | later (group by session) |
| At-least-once delivery: a crash between the provider call and the commit resends | Duplicate text in a rare crash | later (outbox id as the provider's idempotency key) |
| Custom wording is free text for the console and SMS stage; WhatsApp only sends pre-approved templates | With WhatsApp, centers will pick from approved texts instead of writing their own | later (with WhatsApp) |
| An edit to the wording also changes messages already queued (they are filled at send time) | Usually what a center wants (a typo fix); the log shows the text actually sent | — |
| No length check against SMS segments (500 characters allowed; one SMS is 70 Arabic characters) | Long Arabic texts cost several SMS once a paid provider is used | later (a counter on the screen) |
| A teacher's message log shows their groups' session and exam messages (phones masked to the last 3 digits), never fee reminders; the matching is by the group's current teacher | After a teacher change, the new teacher sees the group's older messages | — |
| The message log shows the newest 100, no pagination or search | Older messages are hidden | later |
| Messages queued before Nov 15 (part 2 of the limits plan) skip the send-time re-check and a move among them keeps the old wording | Only rows already waiting at the deploy | — |
| Fee reminders start on the 7th, fixed in code; the amount is the center-wide balance | No per-center day; a teacher-collected fee shows the total | centers |

## Tooling

| Limit | Impact | Fix by |
|:--|:--|:--|
| `@dafter/i18n` index can't load in Node ESM (JSON imports lack `with { type: 'json' }`), so e2e imports the locale JSON directly | Small workaround | later |
| The `run-dafter` screenshot command doesn't sign in | Only public screens can be shot | later |
| Message e2e is skipped during Cairo quiet hours (22:00–08:00) | Night runs check less | — |
| `fee-reminders.spec.ts` is skipped from the 1st to the 6th of the month (Cairo), and makes a new workspace for the seeded owner on every run | Early-month runs check less; the dev owner's workspace list grows (until `pnpm db:reset`) | — |
| `students.spec.ts` [ar] "assistant adds a student…" failed once in the full run (2 workers, `toHaveCount`), then passed alone; CI retries once | Possible flake | later (watch; if it repeats, look at what the count waits on) |
| The GitHub CLI (`gh`) isn't installed on the dev laptop; CI status is read from the public Actions API with `curl` | No PR or log commands from Claude Code | — |
| Web spec `student-app.spec.tsx` "keeps the invite link ready to copy" read the stored invite before the effect wrote it (failed once on CI); it now polls | Fixed in the test; watch for others like it | — |
| `student-app.spec.ts` timed out once (40 s) with the full suite on 6 workers, then passed alone | Possible flake under load | later (watch in CI) |
