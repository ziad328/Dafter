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
- **Editable message templates (Nov 15):** per trigger and language under «نص الرسائل» on `/messages`, filled at send time.
- **Rooms and the room conflict check (Nov 15):** migration `0013_rooms`, `ROOM_BOOKED`, `/rooms`, the room picker. Limits in `docs/known-limits.md` (Groups).

## What's left of the MVP (`docs/product.md`)

| Module | Gap | Waits on |
|:--|:--|:--|
| 1. Accounts | ~~An invite carries the assistant's teachers~~ done Nov 15 (limits plan, Batch 3) | — |
| 5. Fees | Per-session and package-of-N fee plans | The center interviews (open questions in `product.md`) |

Outside the code: the demo video and the center interviews. Done by Ziad on Nov 16: the manual iPhone and Android try, and deleting the local `.env.vercel-secrets`. The rest of the open work is numbered in `docs/backlog.md`.

## Next feature

**An invite that carries the assistant's teachers** (module 1: "An invited assistant who opens the link joins with the role and teachers chosen in the invite"). Today the owner ticks an assistant's teachers after they join. The invite gets the chosen teacher memberships, and accepting it writes the assistant scopes in the same transaction as the membership.

## Start prompt for a new session

Copy everything in the block into a new Claude Code session opened in `D:\Frontend\Dafter`:

```text
Read CLAUDE.md and follow the start-of-session protocol, then read docs/v1-next.md.

Task: build the next v1 feature of Dafter, an invite that carries the assistant's teachers (docs/product.md, module 1: "An invited assistant who opens the link joins with the role and teachers chosen in the invite"). Work on branch main, as the rest of the project does.

Before coding, give me a short plan and wait for my OK. Cover:
- The data: where the chosen teachers live on the invite (a column or a join table), and that accepting writes the membership and its assistant scopes in one transaction, under the invite's single-use lock.
- Rules: only the owner picks teachers; only for an assistant invite; teachers must be owner or teacher memberships of the same workspace; a teacher who left before the invite is accepted is skipped, not an error.
- The contract, the migration, the endpoint changes, the invite screen (pick teachers when the role is assistant) and the ar/en keys.

Then build it in the project's order: contract (`pnpm contracts:gen`), migration, API, web. Tests at every layer: integration tests plus isolation tests, web specs, and a Playwright test of the user flow in ar and en at 375 px. Done means `pnpm test` passes with 100% line coverage in every package, the full Playwright suite passes with 2 workers (`cd e2e && npx playwright test --workers=2`), `docs/progress.md` has a ticked entry, and `docs/known-limits.md` is updated. Commit with a Conventional Commit message and push; apply the migration to Neon as the db-migration skill says and check the live site (`pnpm e2e:live`).
```
