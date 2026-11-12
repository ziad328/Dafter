# Data model & API

The database has about 20 tables in five areas, and every table except the identity tables carries `workspace_id`. Money is stored as integer piastres, and every financial change is an append-only entry.

## Tables

| Area | Table | Key columns | Notes |
| --- | --- | --- | --- |
| Identity | users | id, name, phone, email, password_hash, locale | Global, not per workspace |
| Identity | refresh_tokens | id, user_id, family_id, token_hash, expires_at, revoked_at | Rotation and reuse detection |
| Tenancy | workspaces | id, type (center, independent), name_ar, name_en, timezone, settings | Timezone defaults to Africa/Cairo |
| Tenancy | memberships | user_id, workspace_id, role (owner, teacher, assistant) | Unique per user and workspace |
| Tenancy | assistant_scopes | membership_id, teacher_membership_id | Which teachers an assistant works for |
| Tenancy | invites | id, workspace_id, role, token_hash, expires_at, used_at | Single use |
| Teaching | rooms | id, name, capacity | Centers only |
| Teaching | subjects, grade_levels | id, name_ar, name_en | Seeded with the Egyptian curriculum; editable |
| Teaching | groups | id, teacher_membership_id, subject_id, grade_level_id, room_id, capacity, fee_plan_id, status | |
| Teaching | group_slots | group_id, weekday, start_time, end_time | Source for generating sessions |
| Teaching | sessions | id, group_id, room_id, starts_at, ends_at, status (scheduled, open, closed, cancelled), closed_by, qr_key_encrypted | Generated 4 weeks ahead |
| Students | students | id, name_ar, name_en, phone, grade_level_id, school, user_id (set when the student activates the app), name_search | `name_search` is the normalized Arabic name, indexed with pg_trgm |
| Students | guardians | id, name, phone, relation, preferred_locale, whatsapp_opt_in | One guardian can have many students |
| Students | student_guardians | student_id, guardian_id, is_primary | Lets siblings share a parent |
| Students | enrollments | student_id, group_id, discount_pct, status, joined_at, left_at | |
| Attendance | attendance_records | session_id, student_id, status (present, late, absent, excused, makeup), method (student_scan, manual, auto_close), recorded_by, scanned_at, device_id, qr_window | Unique on session and student, which makes repeated scans harmless; `device_id` and `qr_window` record how the check-in was proven |
| Money | fee_plans | id, type (monthly, per_session, package), amount_piastres, sessions_in_package | |
| Money | ledger_entries | id, student_id, group_id, type (charge, payment, discount, reversal), amount_piastres, method, receipt_no, reverses_entry_id, created_by | Append-only; the balance is the sum of entries |
| Exams | exams, exam_results | exam: group_id, title, max_score, held_on; result: exam_id, student_id, score, absent | Score checked against max_score |
| Messaging | message_templates | workspace_id, trigger, locale, body, enabled | Per trigger and per language |
| Messaging | outbox_messages | id, guardian_id, trigger, payload, dedupe_key, status, attempts, send_after, provider_message_id | Written in the same transaction as the event |
| Audit | audit_log | actor_id, action, entity, entity_id, before, after, at | Every write |

## Design rules

- **Money in piastres.** `amount_piastres` is a 64-bit integer, so 150.50 EGP is stored as 15050. No floating point anywhere near money.
- **Ledger, not a balance column.** A student's balance is computed from `ledger_entries`; a nightly check compares it with a cached value and alerts on any difference.
- **Time.** All timestamps are `timestamptz` in UTC; the workspace timezone is applied only for display and for generating sessions.
- **No hard deletes** for students, payments or attendance. Students are archived; payments are reversed.
- **Idempotency.** Every write that a phone may retry (scans, payments) accepts an `Idempotency-Key` header; repeats return the first result.
- **Jobs live in PostgreSQL.** pg-boss keeps its queue in its own `pgboss` schema, outside RLS, so every job payload carries its `workspace_id` and the worker sets it before touching tenant tables.
- **SaaS tables come later.** `plans` and `subscriptions` (see hosting-saas.md) are added before the first paying center, not in v0.
- **Student accounts.** Two identity tables support them: `otp_codes` (id, channel, destination, code_hash, expires_at, attempts, consumed_at) and `student_devices` (id, user_id, public_key, label, bound_at, revoked_at, revoked_by), with at most one active device per user and one user per device key.

## API

REST over JSON under `/api/v1`. The selected workspace goes in the `X-Workspace-Id` header. Lists use cursor pagination. Errors follow one shape: `{ code, details }`, where `code` is a key such as `ATTENDANCE_ALREADY_RECORDED` that the web app translates.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me` |
| Workspaces | `POST /workspaces`, `GET /workspaces`, `POST /invites`, `POST /invites/:token/accept`, `GET /members`, `PATCH /members/:id` |
| Groups | `GET /groups`, `POST /groups`, `PATCH /groups/:id`, `GET /groups/:id/sessions` |
| Sessions | `GET /sessions?date=today`, `POST /sessions/:id/open`, `POST /sessions/:id/close`, `POST /sessions/:id/cancel`, `PATCH /sessions/:id` (move) |
| Students | `GET /students?q=`, `POST /students`, `PATCH /students/:id`, `POST /students/:id/enrollments`, `GET /students/:id/invite` |
| Attendance | `POST /check-ins` (student: scanned code + device signature), `GET /sessions/:id/live` (teacher, server-sent events), `DELETE /students/:id/device` (assistant reset), `PUT /sessions/:id/attendance/:studentId` (manual) |
| Money | `GET /students/:id/ledger`, `POST /payments`, `POST /ledger/:id/reverse`, `GET /reports/unpaid`, `GET /reports/cash-summary?date=` |
| Exams | `POST /groups/:id/exams`, `PUT /exams/:id/results` (bulk), `POST /exams/:id/notify` |
| Messaging | `GET /message-templates`, `PUT /message-templates/:trigger/:locale`, `GET /messages?status=` |
| Dashboard | `GET /dashboard/today` |

**Student app endpoints:** `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /devices/bind`, `GET /me/schedule`, `GET /me/attendance`, and `POST /check-ins`. They are scoped to the signed-in student's own records across all their workspaces.
