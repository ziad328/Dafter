# Known limits and open issues

Everything we know is missing, unchecked or a deliberate shortcut, in one place. Sources: the "Left:" notes in `progress.md`, `shortcut:` comments in the code, and the session reports and reviews from Days 1–15. Fixed items are removed; new ones are added by the `task-finish` skill. The order to fix them in is `docs/limits-plan.md`.

**Fix by:** **D17** = Day 17 deploy · **v0** = before the v0 tag (Nov 30) · **centers** = before a real center uses it · **later** = when scale or a real need shows up.

## Deploy and infrastructure

| Limit | Impact | Fix by |
|:--|:--|:--|
| The demo runs on Vercel Hobby: personal, non-commercial use only; 4 active CPU-hours a month; functions end after 300 s | Fine for the demo; a paying center needs a paid host or a VPS | centers |
| No always-on worker on Vercel: messages leave right after their write (`OUTBOX_SEND_INLINE`); held ones go at the 08:00 Cairo daily cron; retries wait for the hourly cron-job.org call (optional) | A failed send can wait up to an hour (or a day without cron-job.org) | centers (VPS with pg-boss) |
| Vercel doesn't run migrations; they run from a laptop (`pnpm demo:seed:neon`) before pushing | Forgetting breaks the deploy until it's run | later (a CI step) |
| The live list polls the database every second per open teacher screen | Up to 1 s delay; Neon stays awake while a class is live | later (LISTEN/NOTIFY on a long-running host) |
| The first request after a quiet spell starts NestJS (cold start) | About 1–2 s wait | — |
| CI checks that `openapi.json` and the generated client match the Zod contracts, but has no breaking-change check (`oasdiff`) | A renamed or removed field passes CI; the PWA keeps an old client until it updates | centers |
| Rate limits are in process memory | They reset on restart and count per instance | later (Redis at the VPS stage) |
| Every job loops over all workspaces in one pass (sessions, charges, outbox) | Slow with thousands of workspaces | later |
| Test harness: cloned test databases are never dropped, and the global setup always starts a container | Slower local runs only | later |

## Auth and accounts

| Limit | Impact | Fix by |
|:--|:--|:--|
| The demo's staff password is public (`dafter-dev-123`) | Anyone can change demo data; reseed with `pnpm demo:seed:neon` | — (demo only) |
| Brevo's free tier sends from one verified address and has a daily cap | Login codes stop for the day if the cap is hit | centers (own domain) |
| Register limit skips loopback (`127.0.0.1`) so local tools and tests can sign up freely | None in production (clients are never loopback behind Vercel) | — |
| Two tabs refreshing at the same moment log the user out (reuse detection); single-flight only covers one tab | Rare surprise sign-out | later (short grace window if it bites) |
| The audit row is written in its own transaction after the handler, also for payments | A failed audit insert returns 500 after the write committed; a crash in between loses the audit row | centers |
| Invites: the scope check and the scope update run in separate transactions; extra workspace read on accept; duplicated token-creation code | Only matters once members can be removed | later |
| `PATCH /members/:id` (change role, remove) not built | Staff can't be removed | centers |
| A staff invite carries only the role; the owner ticks an assistant's teachers after they join | One extra step for the owner | later |
| A phone reset from center A also unbinds it at center B (one shared login) | By design, but surprising | — (documented) |
| Anyone holding an invite link can claim that record (single use, 72 h) | Same trust model as staff invites | — (documented) |
| `DEV_MAIL_INBOX=1` exposes login codes to anyone; `DEV_FAKE_PHONE=1` (on in the demo) shows a workspace's parent messages to its staff | Never set `DEV_MAIL_INBOX` on Vercel; turn `DEV_FAKE_PHONE` off with real users | centers |

## Groups, sessions and students

| Limit | Impact | Fix by |
|:--|:--|:--|
| Rooms: a session generated at a time a moved session already holds in the room gets no room (shown without one) instead of failing | The owner fixes that one session by hand | — |
| Rooms: a session can't be moved to another room on its own; only the group's room changes (for its future sessions) | A one-off room swap means moving the group | later |
| Rooms: a group above the room's seats gets a warning on the form, not an error | The owner decides | — |
| Rooms work in independent workspaces too (the data model said centers only) | Harmless; the screen sits under More for everyone | — |
| Curriculum (subjects, grades) can't be edited | Centers with other subjects are stuck | centers |
| A full group is a confirm, not a hard stop (`force: true` adds anyway) | Staff can still over-fill on purpose | — |
| Group slots don't check the teacher's other groups (only a session move does) | A new group can double-book its teacher | later (move the e2e groups at Saturday 16:00 to distinct times first) |
| The teacher check uses each group's current teacher; a past session keeps no teacher of its own | A teacher change re-labels old sessions | — |
| `GET /groups/:id/sessions` not built | Not needed by the timetable | later |
| No cursor pagination (groups, students: first 50) | Big centers can't see everyone | later |
| Teachers see every student in the workspace | Privacy choice not settled | centers |
| The UI handles one guardian per student (the API allows more) | Second parent needs the API | centers |

## Attendance and student app

| Limit | Impact | Fix by |
|:--|:--|:--|
| Real camera, PWA install, invite paste and binding never checked on a real iPhone and Android phone | The core student flow is only tested with hooks | v0 (one manual try each) |
| No "too early to open" check on opening a session | A session can be opened days ahead | centers |
| `POST /check-ins` has no rate limit | Abuse by a bound device | centers |
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
| Teachers can't see the message log (it shows every parent's phone) | They ask the owner or assistant | centers |
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
| Web spec `student-app.spec.tsx` "keeps the invite link ready to copy" failed once in the full web run (the stored invite read as null), then passed alone and in two full runs | Possible timing flake | later (watch) |
| `student-app.spec.ts` timed out once (40 s) with the full suite on 6 workers, then passed alone | Possible flake under load | later (watch in CI) |
