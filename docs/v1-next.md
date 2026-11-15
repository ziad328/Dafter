# v1: open limits, issues and the next feature

Written on Nov 15 after exams, the dashboard and fee reminders (`93662a4`, `cc3c81d`, `c8f02e1`, `8a94d29`, `0ad9c04`). `docs/known-limits.md` stays the full list; this page is the short list from that work, plus the start prompt for the next session.

## Limits from the v1 features so far

| Feature | Limit | Impact | Fix idea |
|:--|:--|:--|:--|
| Fee reminders | A reminder held by quiet hours still goes out if the parent paid in between | A rare wrong money text | The sender re-reads the balance for `fee_overdue` rows and skips them when it is zero |
| Fee reminders | They start on the 7th, fixed in code | No per-center day | A `feeOverdueDay` in `settings.messages` |
| Fee reminders | The amount is the student's balance across the whole center | A teacher-collected fee shows the total | Decide after the center interviews ("who collects the fee?") |
| Exams | No CSV import or export of scores | Big groups are typed by hand | Export first (cheap), import later |
| Exams | A correction resends the same sentence with «تصحيح:» only | Parents don't see the old score | Fine for now |
| Dashboard | Last 8 weeks and 6 months only, no date range | No term view | A `weeks` query param (max 26) |
| Dashboard | Archived groups are left out | Last term's groups disappear | Include them with a filter |
| Dashboard | Bars are plain CSS, no chart library | No tooltips or axis | Fine for now |

## Issues found while testing

- **`students.spec.ts` [ar] flake:** "assistant adds a student…" failed once in the full Playwright run (2 workers, `toHaveCount`), then passed on its own. CI retries once. Watch it; if it repeats, look at what the count waits on.
- ~~**No Playwright for background jobs:**~~ fixed Nov 15: `.env.example` (so CI too) sets a dev-only `CRON_SECRET=dev-cron-secret`, Playwright loads the root `.env`, and `fee-reminders.spec.ts` runs `/internal/tick?daily=1` and finds the reminder in the message log.
- **Not checked by eye on a real phone:** the exam grid, "My grades", the dashboard and the new switch were only checked by the 375 px tests.

## Done since

- **End-of-day cash summary (Nov 15, `91e7790`):** `GET /stats/cash-summary` and the print-ready `/cash-summary` page. Limits are in `docs/known-limits.md` (Money).
- **Fee reminders in Playwright (Nov 15, `fb0f79f`):** the dev `CRON_SECRET` and `fee-reminders.spec.ts`.
- **Neon owner password reset (Nov 15):** done by Ziad; the live smoke test passes after it.

## What's left of the MVP (`docs/product.md`)

| Module | Gap | Waits on |
|:--|:--|:--|
| 2. Groups and schedules | Rooms, and "two groups cannot be booked in the same room at overlapping times" | Nothing: **next feature** |
| 1. Accounts | An invite carries the assistant's teachers (today the owner ticks them after the assistant joins) | Nothing (small) |
| 7. Messaging | Each workspace edits its Arabic and English templates | Nothing, but WhatsApp needs pre-approved templates, so maybe keep fixed wording |
| 5. Fees | Per-session and package-of-N fee plans | The center interviews (open questions in `product.md`) |

Outside the code: the manual iPhone and Android try (`docs/deploy.md` step 6), deleting the local `.env.vercel-secrets`, the demo video, and the center interviews.

## Next feature

**Rooms and the room conflict check** (module 2, Sprint 2's leftover). `docs/data-model-api.md` already plans `rooms (id, name, capacity)`, centers only, with `room_id` on groups and sessions. The hard rule is in the database: an exclusion constraint (`btree_gist`) on sessions, room and time range, so two non-cancelled sessions can't overlap in one room even under concurrent writes; the API checks slots on save to give a translated error (`ROOM_BOOKED`) before the constraint fires.

## Start prompt for a new session

Copy everything in the block into a new Claude Code session opened in `D:\Frontend\Dafter`:

```text
Read CLAUDE.md and follow the start-of-session protocol, then read docs/v1-next.md.

Task: build the next v1 feature of Dafter, rooms and the room conflict check (docs/product.md, module 2: "Two groups cannot be booked in the same room at overlapping times"). Work on branch main, as the rest of the project does.

Before coding, give me a short plan and wait for my OK. Cover:
- The data: a `rooms` table (name, capacity, centers only) as in docs/data-model-api.md, an optional `room_id` on groups, and the room on each generated session (a moved session keeps its room).
- The rule: treat it as a hard part. An exclusion constraint with btree_gist on sessions (room, time range, non-cancelled only) as the backstop, plus an API check on group save and on session move that returns `ROOM_BOOKED` with the clashing group, before the constraint fires. Explain why the constraint beats an app-only check.
- Who may do what: the owner manages rooms; who may pick a room for a group follows the group rules.
- The contract, the migration (RLS and composite FKs like the other tenant tables), the endpoints, the screens (a rooms list under More, a room picker on the group form, the room on timetable rows) and the ar/en keys.

Then build it in the project's order: contract (`pnpm contracts:gen`), migration, API, web. Tests at every layer: integration tests plus isolation tests for the new endpoints, a test that two concurrent overlapping writes leave one, web specs, and a Playwright test of the user flow in ar and en at 375 px. Done means `pnpm test` passes with 100% line coverage in every package, the full Playwright suite passes with 2 workers (`cd e2e && npx playwright test --workers=2`), `docs/progress.md` has a ticked entry, `docs/known-limits.md` is updated, and docs/interview-questions.md has 2 to 3 questions for the hard part. Commit with a Conventional Commit message and push, then apply the migration to Neon as the db-migration skill says and check the live site (`pnpm e2e:live`).

If time is left after that, do the small module 1 gap: an invite that carries the assistant's teachers, so they join already scoped.
```
