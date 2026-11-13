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
