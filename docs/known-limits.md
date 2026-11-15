# Known limits and open issues

Everything we know is missing, unchecked or a deliberate shortcut, in one place. Sources: the "Left:" notes in `progress.md`, `shortcut:` comments in the code, and the session reports and reviews from Days 1–15. Fixed items are removed; new ones are added by the `task-finish` skill.

**Fix by:** **D17** = Day 17 deploy · **v0** = before the v0 tag (Nov 30) · **centers** = before a real center uses it · **later** = when scale or a real need shows up.

## Deploy and infrastructure

| Limit | Impact | Fix by |
|:--|:--|:--|
| The demo runs on Vercel Hobby: personal, non-commercial use only; 4 active CPU-hours a month; functions end after 300 s | Fine for the demo; a paying center needs a paid host or a VPS | centers |
| No always-on worker on Vercel: messages leave right after their write (`OUTBOX_SEND_INLINE`); held ones go at the 08:00 Cairo daily cron; retries wait for the hourly cron-job.org call (optional) | A failed send can wait up to an hour (or a day without cron-job.org) | centers (VPS with pg-boss) |
| Vercel doesn't run migrations; they run from a laptop (`pnpm demo:seed:neon`) before pushing | Forgetting breaks the deploy until it's run | later (a CI step) |
| The live list polls the database every second per open teacher screen | Up to 1 s delay; Neon stays awake while a class is live | later (LISTEN/NOTIFY on a long-running host) |
| The first request after a quiet spell starts NestJS (cold start) | About 1–2 s wait | — |
| CI has never run green on GitHub (remote has up to Day 9; nothing since is pushed); `oasdiff` contract check not set up | Workflow errors are unknown until the first push | D17b (push) |
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
| `DEV_MAIL_INBOX=1` exposes login codes to anyone; `DEV_FAKE_PHONE=1` (on in the demo) shows a workspace's parent messages to its staff | Never set `DEV_MAIL_INBOX` on Render; turn `DEV_FAKE_PHONE` off with real users | centers |

## Groups, sessions and students

| Limit | Impact | Fix by |
|:--|:--|:--|
| No archive button for groups in the UI (the API supports `status`) | Owners can't archive from the screen | v0 if time |
| Curriculum (subjects, grades) can't be edited | Centers with other subjects are stuck | centers |
| No group capacity check on enroll | A group can be over-filled | centers |
| Moving a session doesn't check the teacher's other sessions | Double-booked teacher | centers |
| `GET /groups/:id/sessions` not built | Not needed by the timetable | later |
| Times shown as 24-hour `HH:MM` | Egyptian users expect 12-hour | v0 if time |
| No cursor pagination (groups, students: first 50) | Big centers can't see everyone | later |
| Teachers see every student in the workspace | Privacy choice not settled | centers |
| The UI handles one guardian per student (the API allows more) | Second parent needs the API | centers |

## Attendance and student app

| Limit | Impact | Fix by |
|:--|:--|:--|
| Real camera, PWA install, invite paste and binding never checked on a real iPhone and Android phone | The core student flow is only tested with hooks | v0 (one manual try each) |
| No "too early to open" check on opening a session | A session can be opened days ahead | centers |
| `POST /check-ins` has no rate limit | Abuse by a bound device | centers |
| No UI for the late threshold (`settings.lateAfterMinutes`, default 15) | Fixed 15 minutes | centers |
| The live screen marks only "present" by one tap; late or excused need the API | Rare cases need a workaround | centers |
| No wake-lock or brightness handling on the QR screen | The screen may dim during class | v0 if time |
| A student on a video call can relay the QR | Known weakness of rotating QR (architecture.md) | — (documented) |
| No offline screen when the API is unreachable | The PWA shows errors | later |

## Money

| Limit | Impact | Fix by |
|:--|:--|:--|
| No cash summary or unpaid report | Owners can't see who owes | centers |
| No proration for mid-month joins | A student who joins on the 25th pays the full month | centers |
| No nightly balance check | Drift would go unnoticed (the ledger is append-only) | later |
| Students don't see their balance | Parents ask the center | later |
| Fee model (one monthly fee per group) and who sees money are guesses | May change after center interviews | centers |
| Cash summary: no "handed over" step; the owner can't mark a day as received or see who hasn't handed over | The handover itself is still on paper | centers |
| Cash summary: a reversal counts on the day it was made, so voiding an older payment can make a day's total negative | Shown as is (real money out); can surprise at first | — |
| Cash summary: payments sit under whoever recorded them; one assistant typing in another's takings shows under the wrong person | Rare; fix by reversing and re-entering | — |

## Messages (Day 15)

| Limit | Impact | Fix by |
|:--|:--|:--|
| `whatsapp_opt_in` is not checked | Fine with the console adapter; must be checked before WhatsApp | later (with WhatsApp) |
| Every linked guardian is texted, not only the primary | Possibly more messages than a center wants | centers |
| A manual "absent" after close sends nothing | Late corrections don't reach parents | centers |
| At-least-once delivery: a crash between the provider call and the commit resends | Duplicate text in a rare crash | later (outbox id as the provider's idempotency key) |
| Up to 1 minute delay (one-minute poll) | Fine for parents | — |
| Templates are fixed in code; a center can only switch triggers on or off | Wording can't be customized (WhatsApp needs pre-approved templates anyway) | later |
| Switching a trigger off doesn't cancel messages already queued (e.g. held by quiet hours) | One last message may still go out | later |
| Teachers can't see the message log (it shows every parent's phone) | They ask the owner or assistant | centers |
| The message log shows the newest 100, no pagination or search | Older messages are hidden | later |
| A moved session's message gives the new time only, not the old one | Parents may not know which session moved if there are several | centers |
| A fee reminder held by quiet hours still goes out if the parent paid in between | A rare wrong reminder | later (re-check the balance at send time) |
| Fee reminders start on the 7th, fixed in code; the amount is the center-wide balance | No per-center day; a teacher-collected fee shows the total | centers |

## Tooling

| Limit | Impact | Fix by |
|:--|:--|:--|
| `@dafter/i18n` index can't load in Node ESM (JSON imports lack `with { type: 'json' }`), so e2e imports the locale JSON directly | Small workaround | later |
| The `run-dafter` screenshot command doesn't sign in | Only public screens can be shot | later |
| Message e2e is skipped during Cairo quiet hours (22:00–08:00) | Night runs check less | — |
| `student-app.spec.ts` timed out once (40 s) with the full suite on 6 workers, then passed alone | Possible flake under load | later (watch in CI) |
| `groups.spec.ts` [ar] failed once in the full run on 2 workers (Nov 15), then passed alone and in the next full run | Possible flake: the card is found by a random 3-digit capacity in a dev database that keeps growing | later (watch; a unique label would be safer) |
