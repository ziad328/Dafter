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

## Next feature

The remaining MVP gap in `docs/product.md` (module 5): **an end-of-day cash summary for each assistant**, the money they took today by method, to hand over to the owner. It builds on `GET /stats/collections` (the same "payments minus their reversals" rule), with `created_by` on `ledger_entries` naming who took each payment.

## Start prompt for a new session

Copy everything in the block into a new Claude Code session opened in `D:\Frontend\Dafter`:

```text
Read CLAUDE.md and follow the start-of-session protocol, then read docs/v1-next.md.

Task: build the next v1 feature of Dafter, the end-of-day cash summary per assistant (docs/product.md, module 5: "Each assistant gets an end-of-day cash summary to hand over"). Work on branch main, as the rest of the project does.

Before coding, give me a short plan and wait for my OK. Cover:
- What it shows: today's payments minus their reversals, by method (cash, Vodafone Cash, InstaPay), for the staff member who recorded them (`ledger_entries.created_by`), in the workspace timezone; each payment with student, amount, receipt number and time.
- Who sees what: an assistant and a teacher see their own summary; the owner sees every staff member's summary for a chosen day. Money policy stays as in `apps/api/src/stats` (teachers don't see the center's money, only what they took themselves).
- The contract, the endpoint (likely in `apps/api/src/stats`), any migration (probably none), the screen (a print-ready page like `/receipts/:id`, rule 12) and the ar/en keys.

Then build it in the project's order: contract (`pnpm contracts:gen`), migration if any, API, web. Tests at every layer: integration tests plus isolation tests for the new endpoint, web specs, and a Playwright test of the user flow in ar and en at 375 px. Done means `pnpm test` passes with 100% line coverage in every package, the full Playwright suite passes with 2 workers (`cd e2e && npx playwright test --workers=2`), `docs/progress.md` has a ticked entry, and `docs/known-limits.md` is updated. Commit with a Conventional Commit message and push; if there was a migration, apply it to Neon as the db-migration skill says and check the live site.

If time is left after that, fix the first issue in docs/v1-next.md ("Issues found while testing"): add a dev-only CRON_SECRET so Playwright can run /internal/tick and check that a fee reminder shows in the message log.
```
