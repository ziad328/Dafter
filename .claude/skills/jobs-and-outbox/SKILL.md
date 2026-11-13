---
name: jobs-and-outbox
description: Use for background work - pg-boss jobs, scheduled jobs, the outbox, parent messages, templates, quiet hours, retries, message providers.
---
- Jobs live in apps/api/src/jobs. On a long-running host, pg-boss runs them (worker.ts, or in-process with RUN_WORKER=true). On Vercel there is no worker: GET /internal/tick (CRON_SECRET) runs them from crons, and OUTBOX_SEND_INLINE=1 flushes a workspace's outbox after the write (OutboxSender.afterCommit). Every job must be safe to repeat.
- Messages: insert outbox_messages in the same transaction as the business write, with dedupe_key <trigger>:<entity>:<guardian> and ON CONFLICT DO NOTHING.
- The outbox is the queue: the send-outbox pg-boss job (every minute) takes due rows (status queued, send_after <= Clock.now()) with FOR UPDATE SKIP LOCKED. Quiet hours (22:00 to 08:00, workspace timezone) are set on insert by the SQL function quiet_hours_send_after.
- Retries: send_after = now + 2^attempts minutes, 5 attempts, then status failed. The sent body is stored on the row (the fake phone and the message log read it).
- Providers implement MessageProvider; development and demos use ConsoleProvider.
- Tests freeze Clock and assert exactly one message per guardian even when the action runs twice.
