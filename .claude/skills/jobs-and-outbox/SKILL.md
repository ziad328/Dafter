---
name: jobs-and-outbox
description: Use for background work - pg-boss jobs, scheduled jobs, the outbox, parent messages, templates, quiet hours, retries, message providers.
---
- Jobs live in apps/api/src/jobs. Workers start from worker.ts, or in-process when RUN_WORKER=true (free-tier deploy).
- Messages: insert outbox_messages in the same transaction as the business write, with dedupe_key <trigger>:<entity>:<guardian> and ON CONFLICT DO NOTHING.
- The relay creates pg-boss jobs and respects send_after for quiet hours (22:00 to 08:00 Africa/Cairo) using Clock.
- Retries: exponential backoff, 5 attempts, then status failed.
- Providers implement MessageProvider; development and demos use ConsoleProvider.
- Tests freeze Clock and assert exactly one message per guardian even when the action runs twice.
