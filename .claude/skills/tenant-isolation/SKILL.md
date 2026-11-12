---
name: tenant-isolation
description: Use when adding an endpoint or a tenant-owned table, or when touching auth, guards, RLS, roles or workspace switching.
---
- Register every new endpoint in the isolation suite: a user from workspace B gets 404 on workspace A's resource, and lists return none of A's rows.
- Every new tenant table gets an RLS test: a raw query without app.workspace_id returns 0 rows; with B's id it returns none of A's rows.
- Assistant scope: test both an allowed and a denied group.
- Student endpoints: a student sees only their own records, and a check-in for a group they are not enrolled in (and not a make-up) is rejected.
- Another workspace's resource returns 404, never 403, so existence never leaks.
