# Backlog: what's left or could be better

Collected on Nov 16 from `known-limits.md`, `limits-plan.md`, `v1-next.md`, the UX audits and `product.md`, after Limits Batch 4 and the teacher double-booking check. One line each; the details and reasons stay in `known-limits.md`. The tag in brackets is when it should be fixed: **centers** = before a real center uses it, **later** = when scale or a real need shows up. The UI and UX audit has its own list in `ux-audit-3.md`.

## Money (Batch 5, waits on the center interviews)

1. Per-session and package-of-N fee plans. _(centers)_
2. Proration for students who join mid-month. _(centers)_
3. Cash handover: the owner marks a staff member's day as received and sees who hasn't handed over. _(centers)_
4. A nightly balance check that logs any drift. _(later)_
5. Students see their own balance. _(later)_
6. Cash summary: filter by person and a date range. _(later)_
7. Fee reminders: a per-center start day (fixed on the 7th today) and a per-teacher amount. _(centers)_

## Groups, students, curriculum

8. Editing the curriculum (subjects, grade levels). _(centers)_
9. More than one guardian per student in the UI. _(centers)_
10. Decide whether teachers see every student in the center. _(centers)_
11. Cursor pagination: groups and students (first 50) and the message log (first 100). _(later)_
12. Moving one session to another room. _(later)_
13. Session moves have no "save anyway", so two groups forced into the same time block each other's moves.
14. Dashboard: archived groups are left out; no custom date range. _(later)_
15. Exam scores: CSV export, then import. _(centers)_

## Messages

16. "Primary guardian only" per student, not one switch for the whole center. _(later)_
17. A late "absent" for a second child texts nothing when the guardian already got that session's message. _(later)_
18. An SMS length counter on the wording editor (one Arabic SMS is 70 characters). _(later)_
19. The outbox id as the provider's idempotency key, so a crash can't resend a text. _(later)_
20. Check `whatsapp_opt_in` and switch to approved templates when WhatsApp comes. _(later)_
21. The send-time re-check runs one or two queries per message; group them by session. _(later)_

## Accounts and staff

22. Two tabs refreshing at the same moment sign the user out. _(later)_
23. `PUT /members/:id/scopes` has no lock. _(later)_
24. Removing a member doesn't sign them out of their other centers' tabs (by design).
25. The same token-creation code is copied in three places (staff invite, reset link, student invite). _(later)_
26. Brevo's free tier caps login emails per day; centers need their own sending domain. _(centers)_
27. Routes outside a workspace (sign-in, invite accept, check-in) write their audit row in a separate transaction. _(later)_

## Hosting and scale

28. Vercel Hobby is non-commercial only: a paying center needs a paid host or a VPS. _(centers)_
29. No always-on worker: a failed text can wait up to an hour. _(centers)_
30. ~~Rate limits live in memory per instance.~~ Done Nov 17: they live in PostgreSQL (`rate_limits`). _(done)_
31. The live attendance list polls the database every second; move to LISTEN/NOTIFY. _(later)_
32. Daily jobs loop over every workspace in one pass. _(later)_
33. No offline screen in the PWA. _(later)_

## Tests and tooling

34. Two flaky tests to watch: `students.spec.ts` [ar] and `student-app.spec.ts` under load.
35. Message and fee-reminder e2e tests skip themselves at night and on the 1st–6th of the month.
36. Every API-built e2e group sends `force`, so only `teacher-slots.spec.ts` exercises the teacher check.
37. Cloned test databases are never dropped. _(later)_
38. `@dafter/i18n` can't load in Node ESM, so e2e imports the locale JSON directly. _(later)_
39. The `run-dafter` screenshot command can't sign in. _(later)_
