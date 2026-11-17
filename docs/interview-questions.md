# Interview questions

Questions about each hard part, with short answers. Claude adds 2 to 3 here when it finishes a hard part, instead of asking them in the session. Cover the answer, try it yourself, then compare.

## Day 4 · Staff auth and refresh rotation

**1. Why keep the access token short-lived and in memory, but the refresh token in an httpOnly cookie?**
A JWT can't be revoked, so it lives only 15 minutes, and keeping it in memory keeps it out of localStorage, where any XSS could read it. The refresh token lives long, so it goes where JavaScript can't read it: an httpOnly, SameSite=Strict cookie that is only sent to `/api/v1/auth`.

**2. What is refresh token "family reuse detection", and what attack does it stop?**
Every refresh swaps the token for a new one in the same family and revokes the old one. If a revoked token ever comes back, someone has a copy (the attacker or the real user), so the whole family is revoked and both are signed out. A stolen refresh token works at most once.

**3. Why does rotation run under `SELECT ... FOR UPDATE`?**
Without the row lock, two requests with the same token could both read "not revoked" and both get a new token. The lock makes the second request wait and then see the token as revoked, which counts as reuse.

## Day 5 · Tenant isolation and RLS

**1. Why `SET LOCAL` and `set_config(..., true)` instead of a plain `SET app.workspace_id`?**
Connections are pooled. A plain `SET` lasts for the whole connection, so the next request that gets that connection, maybe from another workspace, would start out with the previous workspace id. `LOCAL` resets at commit or rollback, so the setting can't leak past one transaction.

**2. Why switch to the `dafter_app` role instead of using `FORCE ROW LEVEL SECURITY` on the owner?**
Superusers skip RLS even with FORCE. Locally and in Testcontainers the owner is a superuser, so the policies would silently do nothing and the tests would pass without checking anything. `dafter_app` has NOBYPASSRLS, so the policies always apply to it.

**3. Why return 404, not 403, for another workspace's id, and why make the isolation suite generated?**
A 403 confirms the workspace exists, which leaks information. 404 looks the same as "no such id". The suite reads routes from Nest's metadata and tables from `information_schema`, so a new endpoint without `TenantGuard`, or a new tenant table without RLS, fails CI without anyone remembering to add a test.

## Day 6 · Invites across tenants

**1. The invitee is not a member, so RLS hides the invite. How do you look it up safely?**
One owner-connection read filtered only by `sha256(token)`, which returns the workspace id. Everything after it (consuming the invite, adding the membership) runs under `withTenant` for that id, so RLS applies again.

**2. How is an invite single use when two people click the link at once?**
`UPDATE invites SET used_at = now WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now RETURNING role`. Row locking means only one update matches; the other gets 0 rows and `INVITE_INVALID`. No `SELECT ... FOR UPDATE` round trip is needed.

**3. Why return the same error for unknown, used and expired tokens, and store only a hash?**
Different errors would let someone probe which tokens exist. Storing the hash means a database leak does not hand out working invite links.

## Day 6b · Access token and refresh in the web app

**1. Why keep the access token in memory and not in localStorage?**
Any script that runs on the page (an XSS bug, a bad dependency) can read localStorage and send the token away. A module variable dies with the tab. The long-lived credential is the refresh token in an httpOnly cookie, which scripts cannot read; after a reload the app calls `/auth/refresh` once to get a new access token.

**2. Two requests get a 401 at the same moment. What goes wrong without single-flight, and how does the fix work?**
Each would call `/auth/refresh` with the same cookie. The first rotates it; the second presents a used token, which the server treats as theft and revokes the whole family, so the user is signed out. The fix stores the in-flight refresh promise in one variable (`refreshing ??= ...`), so every caller awaits the same rotation and then retries with the new token. A request that sent the old token after the refresh already finished just retries without refreshing again.

**3. Why must login's 401 never trigger a refresh, and how does `?next=` avoid an open redirect?**
`INVALID_CREDENTIALS` is an answer, not an expired token; refreshing would hide the error and could loop. Only same-app paths (start with `/`, not `//`) are accepted for `next`, so a crafted link cannot send a user to another site after they sign in.

## Day 11 · Student login by email code and phone binding

**1. Why can a wrong OTP guess not simply `throw` inside the verify transaction?**
A throw rolls the transaction back, including the `attempts + 1`, so an attacker would get unlimited guesses. A wrong guess returns `null` (the attempt commits) and the error is thrown after the transaction. The code row is read `FOR UPDATE`, so parallel guesses are counted one by one, and the fifth wrong guess burns the code. With 5 guesses on a 1-in-a-million code that expires in 10 minutes, brute force is not practical.

**2. How does the API stop someone from using `/auth/otp/request` to find out which emails have accounts?**
Without an invite it always answers 204, whether or not it sent a code, and verify has a single `OTP_INVALID` for wrong, expired, burned or never-sent codes. What is left: response timing differs a little (a sent code does an insert and an email), and with an invite token `EMAIL_TAKEN` reveals a staff email to whoever holds that link. Register leaks staff emails the same way.

**3. Why is the phone key made with `extractable: false`, and why does binding need no challenge signature?**
A non-extractable private key can sign but can never be exported, so it cannot be copied off the phone; IndexedDB stores the `CryptoKey` object itself. Binding only stores the public key. A student who binds a key they don't hold gains nothing, because every check-in (Day 12) must be signed by the bound key, which is the proof of possession. Partial unique indexes keep one active key per account and one account per key.

## Day 12 · Rotating-QR check-in

**1. Why is the per-session QR key derived with HMAC(QR_SECRET, session id) instead of stored?**
A random key would have to be stored encrypted, with an encryption key to manage and decrypt code. A derived key is just as unguessable without the server secret, and costs no column, no key rotation and no decrypt step. A database leak reveals nothing. Rotating `QR_SECRET` invalidates only the QR screens that are open at that moment.

**2. Walk through what stops a student checking in from home with a forwarded photo, and what does not.**
The code holds a 10-second window number, and the server accepts only the current or previous window, so a photo is useless after about 20 seconds. The request must also be signed over the exact code by the account's bound, non-extractable phone key, so a friend's phone can't use it for you. What still works: a student on a live video call who scans within those 20 seconds on their own phone. Location checks are the later fix.

**3. How are repeated scans idempotent without an `Idempotency-Key` table?**
The unique key (workspace, session, student) is the natural idempotency key. The insert is `ON CONFLICT DO NOTHING`, then the existing row is read back, so a retry returns the first record with the same status and time. A generic key table pays off for payments, where two separate requests could each be a real charge.

## Fees stretch · Ledger, payments and idempotency

**1. Why a signed, append-only ledger instead of a `balance` column, and how is "append-only" enforced?**
A balance column can drift: a lost update or a bug changes it with no history. With signed entries (charge +, payment −, reversal = −original) the balance is `sum(amount_piastres)`, and every change is a row you can audit. Append-only is enforced by the database: `REVOKE UPDATE, DELETE` from the app role, so even buggy code gets `42501`. A mistake is fixed with a reversal entry.

**2. A phone retries a payment while the first request is still running. Walk through why the student is charged once and the receipt numbers have no gap.**
Each payment first bumps the workspace's receipt counter row (`INSERT … ON CONFLICT DO UPDATE … RETURNING`), which also locks it, so payments in a workspace run one at a time. The retry waits for that lock, then looks up its `Idempotency-Key`, now committed by the original. It throws to roll back its own counter bump (no gap) and returns the original entry. A key reused with a different body fails the stored request-hash check with 409.

**3. Why are money amounts integers in piastres, and how does the form avoid floats?**
Binary floats can't represent 0.1 exactly, so sums drift by fractions of a piastre. Integers are exact. The web parses "150.50" as text (pounds × 100 + the two decimal digits) and never computes with a float. Division by 100 happens only when formatting for display.

## Day 15 · Transactional outbox

**1. Why write the message row in the same transaction as the absences, instead of sending from the API after commit?**
Sending after commit loses the message if the process dies between the commit and the send. Sending before commit can text a parent about an absence that then rolls back. With the outbox, the absence and its message commit together or not at all, and a worker delivers what is committed.

**2. A teacher double-taps "close" and two siblings share a mother. How many messages does she get, and what guarantees it?**
One. The second close finds the session no longer `open` and changes nothing. Even if the insert ran again, `dedupe_key = absence:<session>:<guardian>` is unique per workspace and the insert is `ON CONFLICT DO NOTHING`. The siblings merge because the insert groups the absent students by guardian, so she gets one row that names both children.

**3. Is delivery exactly-once? Where can it still send twice?**
Rows are written exactly once, and `FOR UPDATE SKIP LOCKED` stops two workers from taking the same row. If the worker crashes after the provider accepts a message but before the commit, the row is still `queued` and is sent again: at-least-once. The fix is passing the outbox id as the provider's idempotency key once WhatsApp is added.

## Day 16 · Templates, toggles and session changes

**1. Why check the workspace's message toggle inside the INSERT rather than when sending?**
Then a switched-off trigger never creates a row, so the log only shows messages that were meant to go out, and the worker needs no settings lookup. The trade-off: switching a trigger off doesn't stop messages already queued. That's stated in the API docs, and it's what most people expect from "from now on".

**2. A teacher moves a session to Thursday, then to Friday. How many messages do parents get, and why isn't the dedupe key just `session_moved:<session>:<guardian>`?**
Two, because each tells them something new. The key includes the new start time, so a repeat of the same move (a retry or a double tap) is still one message, while a move to a new time is a new event. A key without the time would silently drop the Friday message.

**3. Where do templates live, and why not in the database?**
In code, one fixed sentence per trigger and language, rendered at send time from a payload snapshot taken at the event. WhatsApp only allows pre-approved templates anyway, so editable wording would mislead centers. A snapshot (names, subject, time) keeps the message true to what happened, even if a student is renamed before the send.

## After v0 · Staff password reset

**1. Why does "forgot password" answer 204 for every email, and why isn't the email sent with `await`?**
So the endpoint can't be used to find out which emails have accounts. The same status is not enough on its own: waiting on the mail provider would make a real account answer slower than an unknown one, so the send runs in the background and a failure is only logged. The rate limit (5 an hour per email and per IP, every request counted) stops inbox flooding and guessing at scale.

**2. How is the reset token stored and made single use?**
32 random bytes in the link, only its SHA-256 in `password_resets` (a fast hash is fine for 256 random bits; argon2 is for guessable passwords). The confirm locks the row with `FOR UPDATE` where it is unused and unexpired, marks every open reset of that user used, sets the argon2id hash and revokes all refresh tokens, in one transaction. Two concurrent confirms: the second waits for the lock, re-checks `used_at` and gets `RESET_INVALID`.

**3. Why build the link from `APP_URL` and not from the request's Host header, and what stays valid after a reset?**
An attacker could send a reset request with their own Host, and the victim would get a real token pointing at the attacker's site (host-header poisoning). After the reset, refresh tokens are dead, but an access token already issued keeps working for up to 15 minutes, the trade-off of stateless JWTs.

## After v0 · Owner-issued reset link

**1. Why can an owner create a reset link only for staff whose account is in this workspace alone?**
Accounts are global: the same login may teach at another center or own its own workspace. A link the owner creates is a link the owner can use, so for a shared account it would be a takeover of access the owner was never given. If the account exists only in this workspace (and is not a student account), the owner gains nothing they don't already control, so it is safe. Everyone else uses "Forgot your password?" by email.

**2. Why does that check read other workspaces' memberships, and how is it kept safe?**
RLS hides other tenants, so the check runs as the table owner without RLS, like the invite lookup. It returns only a yes/no (count of memberships, any student record), never another workspace's data, and the member id is first resolved inside the caller's workspace, so an unknown or foreign id is a plain 404.

## v1 · Exams and grades

**1. Why does `PUT /exams/:id/results` replace the whole grid instead of patching one score at a time?**
The teacher types a grid and taps save once, often on a weak connection. Replacing every row in one transaction makes the request idempotent: a retry or a double tap ends in the same state, and a cleared cell really clears. The exam row is locked `FOR UPDATE` first, so a max-score change and a save can't interleave and let a score above the max in.

**2. How does "send results to parents" stay exactly once, and what is the trade-off?**
The outbox rows are inserted in the same transaction that stamps `notified_at`, with `dedupe_key = exam_result:<exam>:<guardian>:<md5 of that guardian's results>` and `ON CONFLICT DO NOTHING`, grouped by guardian so siblings get one message. A second press queues 0. Because the results are in the key, a press after fixing a score texts only the parents whose children's results changed, with no version column.

**3. Why is the score-above-max rule in the service and not a database check?**
A check constraint can only see its own row, and the max lives on the exam row. A trigger could do it, but the service already holds the exam row locked and returns a code with the student's id for the grid. The database still enforces what it can see: score ≥ 0 or absent, never both.

## v1 · Fee-overdue reminders

**1. The reminder job runs every day. How does a parent get at most one reminder a month?**
The dedupe key is `fee_overdue:<YYYY-MM>:<guardian>`, with the month taken in the workspace timezone, and the insert is `ON CONFLICT DO NOTHING`. Days 7 to 31 all try to insert the same key, so only the first lands; a new month makes a new key. A rerun after a crash or a retried cron call is therefore harmless.

**2. Why is this switch off by default when the other message switches are on?**
A wrong money text is worse than a missing one: it can embarrass a center with a parent who already paid in cash at another desk. Centers also differ on who collects fees, so each center turns reminders on when its records are trustworthy. A missing key in `settings.messages` reads as `false` for this one trigger.

**3. A parent pays at 23:00 on the 7th. The reminder was queued at 03:00 but held by quiet hours until 08:00. What happens, and how would you fix it?**
They still get the reminder, because the balance is snapshotted in the payload at queue time. A fix is a check at send time: the sender re-reads the balance for `fee_overdue` rows and marks them skipped when it is zero, keeping the outbox as the single source of what was sent.

## v1 · Rooms and the room conflict check

**1. Two groups must never share a room at the same time. Why an exclusion constraint and not just a check in the API?**
A read-then-write check races: two saves both read "free" and both write. `EXCLUDE USING gist (workspace_id WITH =, room_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` makes PostgreSQL refuse the second overlapping row however it arrives (an API call, the job, a script). The API check still runs first, because only it can say which slot clashes (`ROOM_BOOKED` with the day and time).

**2. With the constraint in place, why lock the room row (`SELECT … FOR UPDATE`) in the slot check?**
The constraint works on sessions, and the session generator has a fallback that gives a session no room when a moved session already holds it. Without the lock, two concurrent saves both pass the slot check, the first commits, and the second's generator sees the first's sessions and quietly drops the room instead of failing. The lock makes saves into one room run one after the other, so the second sees the first's slots and gets `ROOM_BOOKED`.

**3. Why `tstzrange(starts_at, ends_at)` with the default `[)` bounds?**
Half-open ranges let back-to-back classes share a room: 16:00–17:30 and 17:30–19:00 don't overlap. Ranges on `timestamptz` also make the rule independent of the workspace timezone and DST; the weekly slot check compares local times only because slots are stored that way.

## v1 · Editable message templates

**1. A center edits its absence text at 23:00. Parents absent at 21:30 are still held by quiet hours. Which text do they get, and why?**
The new one. The outbox stores a snapshot of the facts (students, subject, time), not the sentence; the sender fills the center's current wording when it sends at 08:00, then stores the sent body on the row. So the log still shows exactly what went out, and an edit fixes a typo for every message not yet sent.

**2. Why are placeholders filled in one pass with a single regex replace instead of a loop of `replaceAll` calls?**
A loop re-reads its own output: a student named «{center}» would be replaced again by the center's name, and the order of the loop would change the result. One pass over the original text reads each `{name}` once and never touches inserted values, so user data can't be expanded.

**3. Why do the default texts live in `packages/contracts` instead of the API?**
The web preview has to match what parents receive exactly. With the defaults and `fillTemplate` in the shared package, the API and the screen use the same code; only the values differ (real snapshot vs. sample names). It also means saving the default text sends `null`, so a later improvement to the default reaches centers that never customised it.

## v1 · Group capacity and teacher double-booking

**1. Two assistants enroll the 20th and 21st student into a 20-seat group at the same moment. How does `GROUP_FULL` stay right?**
The enroll locks the group row (`SELECT … FOR UPDATE`) before counting active enrollments, so the second transaction waits until the first commits and then counts 20. Without the lock both count 19 and both insert. A unique or check constraint can't express "count below capacity", so a row lock is the simple fix.

**2. Why lock the teacher with `pg_advisory_xact_lock` on a move instead of `FOR UPDATE` on the membership row?**
Two moves of different groups by one teacher touch different session rows, so nothing they share gets locked by the update itself. An advisory lock keyed on the teacher's membership id serialises them without needing UPDATE rights or RLS write policies on `memberships`, and it is released automatically at commit or rollback.

**3. Why check the teacher clash after the `UPDATE` instead of before?**
After the update the session row already holds the new times, so the overlap query compares stored rows only (no time maths repeated in two places), skips the session itself with `o.id <> s.id`, and a clash just throws: the transaction rolls the move back and no "session moved" message is queued.

## v1 · Messages that are always right (outbox)

**1. A fee reminder is queued at 23:00 and held by quiet hours; the parent pays at 07:30. What stops the 08:00 text?**
The sender re-checks each row after locking it (`FOR UPDATE SKIP LOCKED`): it sums the children's ledger entries again, drops the ones at zero, and marks the row `skipped/paid` when none are left. The check and the send happen in one transaction, under the same lock that stops two senders taking the row.

**2. Why mark the row `skipped` instead of deleting it?**
The unique `dedupe_key` is what makes the job safe to rerun. Deleting the row frees the key, so the next daily run would queue the same reminder again. Keeping it also lets the log say why nothing went out.

**3. A teacher marks a student absent after the session closed. How does the parent get exactly one message?**
The mark runs `enqueueAbsences` for that one student in the same transaction as the attendance write, with the usual `absence:<session>:<guardian>` key and `ON CONFLICT DO NOTHING`. Marking absent twice, or a guardian already told at close, hits the same key and queues nothing.

## v1 · Staff management and the request transaction

**1. Two owners remove each other at the same moment. How does the center keep an owner?**
Each removal first locks the workspace's active owner rows (`SELECT … FOR UPDATE`). The second transaction waits for the first to commit, then counts one owner left and returns `LAST_OWNER`. Counting without the lock, both would see two owners and both succeed.

**2. A teacher is removed while their 15-minute access token is still valid. Why are they locked out at once?**
The tenant guard looks up the membership on every request and only accepts `status = active`, so the next request is the same 404 a stranger gets. The token proves who they are, not where they belong, so nothing needs revoking, and their other centers keep working.

**3. The audit row now commits with the write. Why savepoints instead of reusing the request transaction directly?**
Some repository blocks rely on rolling back their own work: a repeated payment undoes its receipt-counter bump, and a constraint error becomes `ROOM_BOOKED`. Without savepoints, the first would leave the bump in place, and the second would abort the whole request transaction. `tx.transaction()` gives each block a savepoint, so it behaves exactly like its old separate transaction, but everything commits together at the end.

## Limits Batch 4: safety and operations

**1. Why is the check-in's per-session limit counted only after the phone's signature passes?**
A code with a valid MAC only proves someone saw the screen. Counting it earlier would let a photo replayed from a few unbound accounts use up the session's 300 scans a minute and block the real class. After the signature, every counted scan comes from a bound phone, and each phone is already capped at 10 a minute.

**2. Why mask the teacher's phones in the API instead of in the screen?**
Anything the API sends is readable in the browser's network tab, so masking in React only hides the number from people who don't look. The server never sends the full number to a teacher; for the same reason it drops `lastError`, which a provider can fill with the number.

**3. CI migrates Neon before Vercel promotes the build. What does that require of each migration?**
Between the migration and the promotion the old code runs on the new schema, so a migration may only add things (tables, nullable or defaulted columns, enum values). A drop or rename waits for a later push, once no live code uses the old name: expand first, contract later.

## Teacher double-booking on group slots

**1. Why is a teacher clash a warning with `force`, but a room clash a hard error?**
A room can't hold two classes, so ROOM_BOOKED is a fact. A teacher at two groups at once is usually a mistake but sometimes deliberate (two halls sharing one lesson, an assistant covering), so the owner confirms it. The room is checked first, so a forced save never skips the room.

**2. How do two saves at the same moment not both take the teacher's free hour?**
Both take `pg_advisory_xact_lock` on the teacher's membership id before checking, the same lock a session move takes. The second waits until the first commits, then its check sees the first group's slots and answers TEACHER_BOOKED.

## Close summary: counting the queued parent messages

**1. How does the close know how many parent messages it queued without a second query?**
The outbox insert is one `insert … select … on conflict do nothing` in the close transaction, so its `rowCount` is exactly the new rows. Siblings merge into one message per guardian, so the count is guardians, not students.

**2. Why can't a repeated close inflate that number?**
A second close is refused (SESSION_NOT_OPEN), and even a replayed insert hits the unique `dedupe_key` and counts 0. The number shown is what the sender will really send, unless the workspace switched absence messages off, which makes it 0 too.

## Invite preview and revoke

**1. `GET /invites/:token` needs no sign-in. Why is that safe?**
The token is 32 random bytes and only its hash is stored, so guessing one is hopeless; the answer holds only the center's name and the role, and only for an invite that can still be accepted. It is the same trust the accept link already had.

**2. Why is revoking an invite "expire it now" instead of a delete or a new column?**
Accept already refuses an expired invite in its single conditional UPDATE, so no new check is needed, the row stays for the audit log, and no migration has to reach Neon. The update is filtered by workspace, so another center's id answers 404.

## Login rate limits per login and per IP

**1. Why two limits (5 failures per login, 50 per IP) instead of one shared counter?**
A center's staff share one Wi‑Fi address, so one shared counter let one person's typos lock everyone out. The per-login limit stops guessing one account's password; the high per-IP cap still stops one machine from spraying many accounts, which a login-only limit would allow.

**2. Why return `retryAfterSeconds` instead of only RATE_LIMITED?**
"Wait a little" makes people retry at once, and every retry is another failure. The limiter knows when the window ends, so the screen can say «حاول بعد 15 دقيقة». The number is the longest wait among the blocked keys, so it is never too short.

**3. What is the weakness of these in-memory limits?**
They live in one process: a restart clears them and each serverless instance counts on its own, so an attacker spread across instances gets more tries. The fix is a shared store (PostgreSQL or Redis) once the app runs on one long-lived server.

## Student activation link preview

**1. Why may `GET /student-invites/:token` answer without any sign-in?**
The student has no login yet, and the token (32 random bytes, only its hash stored) is already the secret that lets them create one. The answer is small on purpose: first names and the center, and only while the link is unused, unexpired and the student not yet activated (the same query the code request uses).

**2. Why does a used, an expired and an unknown token give the same `INVITE_INVALID`?**
Different answers would tell someone holding an old link that it once was real. One answer leaks nothing, and the screen only needs "no greeting" plus the code request's own error.

**3. Why a per-IP limit when the token can't be guessed?**
Guessing is hopeless, but each call is still a database read anyone can trigger. Sixty lookups per IP in 15 minutes is far above a real student and stops a script from turning the endpoint into free load.

## Rate limits in PostgreSQL

**1. Why does one `INSERT … ON CONFLICT DO UPDATE` stop two parallel requests from both slipping under the limit?**
The upsert locks the key's row, so the second request waits and then sees the first one's count. `take` puts the check in the same statement (`WHERE count < max OR the window ended`), so there is no gap between reading the count and writing it, unlike a SELECT followed by an UPDATE.

**2. Why take the time from the `Clock` service and not the database's `now()`?**
Tests move a fake clock to the end of a window; with `now()` they would have to sleep 15 minutes. It also keeps one source of time for the whole request.

**3. What does a fixed window give up, and when would you change it?**
Someone can use the full limit just before the window ends and again just after, so up to twice the limit in a short burst. For login (5 tries) that is still tiny. A sliding window or a token bucket fixes it at the cost of more state per key; worth it only if abuse shows up.
