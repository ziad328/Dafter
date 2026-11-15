# Plan: fixing the known limits

Written Nov 15 from `docs/known-limits.md`. That file stays the full list; this one groups the limits into batches that each fit one or two sessions, in the order they should be done before a real center uses Dafter. Each batch follows the usual flow (contract, migration, API, web, tests at every layer, docs). When a row is fixed, delete it from `known-limits.md` and tick it here.

**Size:** S = a few hours · M = about a day · L = more than a day. *Hard part* = explain first, add interview questions after.

## Batch 1 · Quick wins on screens people use daily (S each, mostly web)

Nothing here needs the center interviews. Good filler between bigger features.

- [x] **Archive a group from the UI.** Done Nov 15. An "Archive" / "Restore" action on the group page (the API already takes `status`). Archived groups drop out of Today and the timetable.
- [x] **Late threshold setting.** Done Nov 15 (on a new `/settings` screen). A number field on the workspace settings («يُعتبر متأخرًا بعد … دقيقة»), saved to `settings.lateAfterMinutes` (default 15, 0–120).
- [x] **Keep the QR screen awake.** Done Nov 15. `navigator.wakeLock.request('screen')` while the live session is open, released on close or tab hide; no-op where unsupported.
- [x] **Group capacity on enroll.** Done Nov 15. `GROUP_FULL` when active enrollments reach `capacity`; staff can still add after a confirm (`force: true`), on the student page and the new-student form.
- [x] **Teacher double-booking on move.** Done Nov 15 (moves only). Moving a session to a time when the teacher has another non-cancelled session returns `TEACHER_BOOKED`. The same check on group slots waits: the e2e tests create many groups for one seeded teacher at Saturday 16:00, so it needs those fixtures moved to distinct times first.
- [x] **Room capacity hint.** Done Nov 15. A warning (not an error) on the group form when the group's capacity is above the room's.
- [x] **Dashboard range.** Done Nov 15. A `weeks` query param (8 default; 8, 13 or 26) and an 8 / 13 / 26 switch on the screen; money stays at 6 months.

## Batch 2 · Messages that are always right (M, *hard part: outbox*)

Do this **after editable templates** (same files: `messages/templates.ts`, the outbox insert and the sender).

- [x] **Re-check at send time.** Done Nov 15 (absences too: a child marked present before the send is dropped). The sender re-reads the balance for `fee_overdue` rows and marks them `skipped` when it is zero; a row whose trigger was switched off since it was queued is `skipped` too. New status `skipped` in the log, with the reason.
- [x] **Late corrections reach parents.** Done Nov 15. A manual "absent" after close queues the absence message (same dedupe key, so a second change does nothing); a change from absent to present after the message went out sends nothing (documented).
- [x] **Primary guardian only.** Done Nov 15. A `settings.messages.primaryOnly` switch (default off: today's behaviour).
- [x] **Moved session says from when.** Done Nov 15. The `session_moved` template gets the old time («حصة السبت 4:00 م أصبحت الأحد 5:00 م»).

## Batch 3 · Staff management (M, *hard part: auth and tenancy*)

- [x] **Invite carries the assistant's teachers** Done Nov 15. (the next feature in `docs/v1-next.md`). Accepting writes the membership and its scopes in one transaction, which also removes the separate scope-check transaction and the extra workspace read.
- [x] **`PATCH /members/:id`** Done Nov 15 (no global sign-out: the tenant guard locks them out on the next request): change a role, or remove a member (`status = removed`, sessions and memberships revoked, their groups stay with a "no teacher" warning until reassigned). Owner only; the last owner can't be removed.
- [x] **Audit in the same transaction** Done Nov 15 (tenant routes; sign-in and invite accept keep their own). as the write it records (the interceptor gets the request's transaction instead of opening its own), so a failed audit row rolls the write back.

## Batch 4 · Before real users: safety and operations (M)

- [ ] **Rate limit `POST /check-ins`** per device and per session (for example 10 a minute), with the same in-memory limiter as login.
- [ ] **"Too early to open."** Opening a session more than 30 minutes before its start returns `SESSION_TOO_EARLY`.
- [ ] **Demo-only switches off by default in production.** `DEV_FAKE_PHONE` read from the environment only on the demo deploy; a startup check refuses `DEV_MAIL_INBOX` when `NODE_ENV=production`.
- [ ] **Breaking-change check in CI.** `oasdiff breaking` between `main`'s `openapi.json` and the PR's.
- [ ] **Migrations as a step, not a habit.** A GitHub Actions job on `main` that runs the Neon migration (secret `NEON_DATABASE_URL_UNPOOLED`) before Vercel's build is promoted, so a push can't deploy code ahead of its schema.
- [ ] **Teachers and the message log.** A teacher sees the messages of their own groups, with phones masked except the last 3 digits.

## Batch 5 · Money, after the center interviews (L)

Wait for the answers to the open questions in `docs/product.md` (who collects, per month or per session).

- [ ] Per-session and package-of-N fee plans.
- [ ] Proration for mid-month joins (a setting: full month, half month after the 15th, or by sessions left).
- [ ] Cash handover: the owner marks a staff member's day as received; the summary shows who hasn't handed over.
- [ ] CSV export of exam scores (then import).
- [ ] A nightly balance check (sum of entries vs. the sum shown) that logs any drift.

## Later, when scale or a host change asks for it

Rate limits in Redis, LISTEN/NOTIFY for the live list, cursor pagination (groups, students, message log), batching the jobs per workspace, dropping cloned test databases, curriculum editing, more than one guardian in the UI, an offline screen in the PWA. These need a long-running host (the VPS stage) or real traffic to justify them.

## Not fixes, by design

Rooms in independent workspaces, the one shared student login across centers, invite links as bearer tokens, the rotating QR's video-call weakness, the public demo password, and the cash summary counting a reversal on its own day. Each is documented in `known-limits.md` with its reason.
