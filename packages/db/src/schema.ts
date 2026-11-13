import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  smallint,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const tz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => tz('created_at').notNull().defaultNow();

export const workspaceType = pgEnum('workspace_type', ['center', 'independent']);
export const memberRole = pgEnum('member_role', ['owner', 'teacher', 'assistant']);
export const locale = pgEnum('locale', ['ar', 'en']);
export const groupStatus = pgEnum('group_status', ['active', 'archived']);
export const sessionStatus = pgEnum('session_status', ['scheduled', 'open', 'closed', 'cancelled']);
export const studentStatus = pgEnum('student_status', ['active', 'archived']);
export const guardianRelation = pgEnum('guardian_relation', ['father', 'mother', 'other']);

// Identity: global, not per workspace.

export const users = pgTable(
  'users',
  {
    id: id(),
    name: text('name').notNull(),
    phone: text('phone').unique(),
    email: text('email'),
    // Null for students, who sign in with a one-time code.
    passwordHash: text('password_hash'),
    locale: locale('locale').notNull().default('ar'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('users_email_lower_key').on(sql`lower(${t.email})`),
    check('users_phone_or_email', sql`${t.phone} is not null or ${t.email} is not null`),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: tz('expires_at').notNull(),
    revokedAt: tz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('refresh_tokens_family_idx').on(t.familyId),
    index('refresh_tokens_user_idx').on(t.userId),
  ],
);

// Tenancy.

export const workspaces = pgTable('workspaces', {
  id: id(),
  type: workspaceType('type').notNull(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en'),
  timezone: text('timezone').notNull().default('Africa/Cairo'),
  settings: jsonb('settings').notNull().default({}),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: memberRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('memberships_workspace_user_key').on(t.workspaceId, t.userId),
    // Target for composite foreign keys, so child rows cannot point into another workspace.
    unique('memberships_workspace_id_key').on(t.workspaceId, t.id),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const assistantScopes = pgTable(
  'assistant_scopes',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    membershipId: uuid('membership_id').notNull(),
    teacherMembershipId: uuid('teacher_membership_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.membershipId, t.teacherMembershipId] }),
    foreignKey({
      name: 'assistant_scopes_membership_fk',
      columns: [t.workspaceId, t.membershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'assistant_scopes_teacher_fk',
      columns: [t.workspaceId, t.teacherMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }).onDelete('cascade'),
  ],
);

export const invites = pgTable(
  'invites',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    role: memberRole('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: tz('expires_at').notNull(),
    usedAt: tz('used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('invites_workspace_idx').on(t.workspaceId, t.createdAt)],
);

// Teaching. Each workspace gets its own copy of the curriculum (see curriculum.ts), so it can edit it.

const curriculumTable = (name: string) =>
  pgTable(
    name,
    {
      id: id(),
      workspaceId: uuid('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      nameAr: text('name_ar').notNull(),
      nameEn: text('name_en').notNull(),
      sortOrder: smallint('sort_order').notNull(),
      createdAt: createdAt(),
    },
    (t) => [
      unique(`${name}_workspace_id_key`).on(t.workspaceId, t.id),
      index(`${name}_workspace_sort_idx`).on(t.workspaceId, t.sortOrder),
    ],
  );

export const subjects = curriculumTable('subjects');
export const gradeLevels = curriculumTable('grade_levels');

export const groups = pgTable(
  'groups',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    // An owner or teacher membership: independent teachers own their workspace and teach in it.
    teacherMembershipId: uuid('teacher_membership_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    gradeLevelId: uuid('grade_level_id').notNull(),
    capacity: integer('capacity'),
    // Integer piastres; null = no monthly charge (fees stretch, Day 14).
    monthlyFeePiastres: integer('monthly_fee_piastres'),
    status: groupStatus('status').notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('groups_workspace_id_key').on(t.workspaceId, t.id),
    index('groups_workspace_teacher_idx').on(t.workspaceId, t.teacherMembershipId),
    // Composite keys: a group cannot point at another workspace's teacher, subject or grade.
    foreignKey({
      name: 'groups_teacher_fk',
      columns: [t.workspaceId, t.teacherMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }),
    foreignKey({
      name: 'groups_subject_fk',
      columns: [t.workspaceId, t.subjectId],
      foreignColumns: [subjects.workspaceId, subjects.id],
    }),
    foreignKey({
      name: 'groups_grade_level_fk',
      columns: [t.workspaceId, t.gradeLevelId],
      foreignColumns: [gradeLevels.workspaceId, gradeLevels.id],
    }),
    check('groups_capacity_check', sql`${t.capacity} is null or ${t.capacity} > 0`),
  ],
);

/** Weekly slots, the source for session generation. Times are local to the workspace timezone. */
export const groupSlots = pgTable(
  'group_slots',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    groupId: uuid('group_id').notNull(),
    // 0 = Sunday ... 6 = Saturday, as in JavaScript's getDay().
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [
    index('group_slots_workspace_group_idx').on(t.workspaceId, t.groupId),
    foreignKey({
      name: 'group_slots_group_fk',
      columns: [t.workspaceId, t.groupId],
      foreignColumns: [groups.workspaceId, groups.id],
    }).onDelete('cascade'),
    check('group_slots_weekday_check', sql`${t.weekday} between 0 and 6`),
    check('group_slots_time_check', sql`${t.endTime} > ${t.startTime}`),
  ],
);

/**
 * One meeting of a group, generated from its slots 4 weeks ahead. `slot_starts_at` is the time
 * the slot produced and never changes: a move edits only `starts_at`/`ends_at`, so re-running
 * generation does not bring back a moved or cancelled session.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    groupId: uuid('group_id').notNull(),
    slotStartsAt: tz('slot_starts_at').notNull(),
    startsAt: tz('starts_at').notNull(),
    endsAt: tz('ends_at').notNull(),
    status: sessionStatus('status').notNull().default('scheduled'),
    openedAt: tz('opened_at'),
    closedBy: uuid('closed_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('sessions_workspace_id_key').on(t.workspaceId, t.id),
    unique('sessions_group_slot_key').on(t.workspaceId, t.groupId, t.slotStartsAt),
    index('sessions_workspace_starts_idx').on(t.workspaceId, t.startsAt),
    foreignKey({
      name: 'sessions_group_fk',
      columns: [t.workspaceId, t.groupId],
      foreignColumns: [groups.workspaceId, groups.id],
    }),
    check('sessions_time_check', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

// Students: workspace-wide (any staff role), never deleted, only archived.

export const students = pgTable(
  'students',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en'),
    phone: text('phone'),
    gradeLevelId: uuid('grade_level_id').notNull(),
    school: text('school'),
    // Set when the student activates the app (Day 11).
    userId: uuid('user_id').references(() => users.id),
    // normalizeArabic(name_ar + name_en), written by the API on every save.
    nameSearch: text('name_search').notNull(),
    status: studentStatus('status').notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('students_workspace_id_key').on(t.workspaceId, t.id),
    // Not unique: siblings may share a phone; the app only warns.
    index('students_workspace_phone_idx').on(t.workspaceId, t.phone),
    index('students_name_search_idx').using('gin', t.nameSearch.op('gin_trgm_ops')),
    foreignKey({
      name: 'students_grade_level_fk',
      columns: [t.workspaceId, t.gradeLevelId],
      foreignColumns: [gradeLevels.workspaceId, gradeLevels.id],
    }),
  ],
);

/** One row per parent phone in a workspace, so siblings share a guardian (and one message). */
export const guardians = pgTable(
  'guardians',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name'),
    phone: text('phone').notNull(),
    relation: guardianRelation('relation').notNull().default('other'),
    preferredLocale: locale('preferred_locale').notNull().default('ar'),
    whatsappOptIn: boolean('whatsapp_opt_in').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique('guardians_workspace_id_key').on(t.workspaceId, t.id),
    unique('guardians_workspace_phone_key').on(t.workspaceId, t.phone),
  ],
);

export const studentGuardians = pgTable(
  'student_guardians',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    studentId: uuid('student_id').notNull(),
    guardianId: uuid('guardian_id').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.studentId, t.guardianId] }),
    index('student_guardians_guardian_idx').on(t.workspaceId, t.guardianId),
    uniqueIndex('student_guardians_one_primary_key')
      .on(t.workspaceId, t.studentId)
      .where(sql`${t.isPrimary}`),
    foreignKey({
      name: 'student_guardians_student_fk',
      columns: [t.workspaceId, t.studentId],
      foreignColumns: [students.workspaceId, students.id],
    }),
    foreignKey({
      name: 'student_guardians_guardian_fk',
      columns: [t.workspaceId, t.guardianId],
      foreignColumns: [guardians.workspaceId, guardians.id],
    }),
  ],
);

// Audit: every write. workspace_id is null for actions outside a workspace (register, login).

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    at: tz('at').notNull().defaultNow(),
  },
  (t) => [index('audit_log_workspace_at_idx').on(t.workspaceId, t.at)],
);

// Student accounts (Day 11). Identity tables are global: one login spans every center.

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: id(),
    channel: text('channel').notNull().default('email'),
    // Lowercased email.
    destination: text('destination').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: tz('expires_at').notNull(),
    attempts: smallint('attempts').notNull().default(0),
    consumedAt: tz('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('otp_codes_destination_idx').on(t.destination, t.createdAt)],
);

/** A phone's WebCrypto public key. At most one active device per user and one user per key. */
export const studentDevices = pgTable(
  'student_devices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    // SPKI, base64url (ECDSA P-256).
    publicKey: text('public_key').notNull(),
    label: text('label'),
    boundAt: tz('bound_at').notNull().defaultNow(),
    revokedAt: tz('revoked_at'),
    revokedBy: uuid('revoked_by').references(() => users.id),
  },
  (t) => [
    uniqueIndex('student_devices_one_active_per_user')
      .on(t.userId)
      .where(sql`${t.revokedAt} is null`),
    uniqueIndex('student_devices_one_active_per_key')
      .on(t.publicKey)
      .where(sql`${t.revokedAt} is null`),
  ],
);

/** Single-use activation link for one student record (72 hours, hash stored). */
export const studentInvites = pgTable(
  'student_invites',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    studentId: uuid('student_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: tz('expires_at').notNull(),
    usedAt: tz('used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('student_invites_student_idx').on(t.workspaceId, t.studentId),
    foreignKey({
      name: 'student_invites_student_fk',
      columns: [t.workspaceId, t.studentId],
      foreignColumns: [students.workspaceId, students.id],
    }),
  ],
);

export const enrollmentStatus = pgEnum('enrollment_status', ['active', 'left']);

export const enrollments = pgTable(
  'enrollments',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    studentId: uuid('student_id').notNull(),
    groupId: uuid('group_id').notNull(),
    discountPct: smallint('discount_pct').notNull().default(0),
    status: enrollmentStatus('status').notNull().default('active'),
    joinedAt: tz('joined_at').notNull().defaultNow(),
    leftAt: tz('left_at'),
  },
  (t) => [
    unique('enrollments_workspace_id_key').on(t.workspaceId, t.id),
    // Leaving keeps the row (history), so only one active enrollment per student and group.
    uniqueIndex('enrollments_one_active_key')
      .on(t.workspaceId, t.studentId, t.groupId)
      .where(sql`${t.status} = 'active'`),
    index('enrollments_group_idx').on(t.workspaceId, t.groupId),
    check('enrollments_discount_pct', sql`${t.discountPct} between 0 and 100`),
    foreignKey({
      name: 'enrollments_student_fk',
      columns: [t.workspaceId, t.studentId],
      foreignColumns: [students.workspaceId, students.id],
    }),
    foreignKey({
      name: 'enrollments_group_fk',
      columns: [t.workspaceId, t.groupId],
      foreignColumns: [groups.workspaceId, groups.id],
    }),
  ],
);

// Attendance (Day 12): one row per session and student; a repeat scan is a no-op.

export const attendanceStatus = pgEnum('attendance_status', [
  'present',
  'late',
  'absent',
  'excused',
  'makeup',
]);
export const attendanceMethod = pgEnum('attendance_method', [
  'student_scan',
  'manual',
  'auto_close',
]);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sessionId: uuid('session_id').notNull(),
    studentId: uuid('student_id').notNull(),
    status: attendanceStatus('status').notNull(),
    method: attendanceMethod('method').notNull(),
    // Staff user for manual marks; null for scans and auto-close.
    recordedBy: uuid('recorded_by').references(() => users.id),
    recordedAt: tz('recorded_at').notNull(),
    // How a scan was proven: the device key and the QR window it signed.
    deviceId: uuid('device_id').references(() => studentDevices.id),
    qrWindow: bigint('qr_window', { mode: 'number' }),
  },
  (t) => [
    unique('attendance_records_session_student_key').on(t.workspaceId, t.sessionId, t.studentId),
    index('attendance_records_student_idx').on(t.workspaceId, t.studentId),
    foreignKey({
      name: 'attendance_records_session_fk',
      columns: [t.workspaceId, t.sessionId],
      foreignColumns: [sessions.workspaceId, sessions.id],
    }),
    foreignKey({
      name: 'attendance_records_student_fk',
      columns: [t.workspaceId, t.studentId],
      foreignColumns: [students.workspaceId, students.id],
    }),
  ],
);

// Money (fees stretch). Append-only and signed: charge > 0, payment < 0, a reversal is minus the
// entry it reverses, so a balance is sum(amount_piastres). dafter_app may not UPDATE or DELETE.

export const ledgerEntryType = pgEnum('ledger_entry_type', ['charge', 'payment', 'reversal']);
export const paymentMethod = pgEnum('payment_method', ['cash', 'vodafone_cash', 'instapay']);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    studentId: uuid('student_id').notNull(),
    groupId: uuid('group_id').notNull(),
    type: ledgerEntryType('type').notNull(),
    amountPiastres: bigint('amount_piastres', { mode: 'number' }).notNull(),
    method: paymentMethod('method'),
    receiptNo: integer('receipt_no'),
    // Monthly charges: the month ("YYYY-MM") billed, one per student and group, so leaving and
    // rejoining in the same month is not billed twice.
    enrollmentId: uuid('enrollment_id'),
    period: text('period'),
    reversesEntryId: uuid('reverses_entry_id'),
    note: text('note'),
    // Retried writes: the same key returns this entry; request_hash catches a key reused for a
    // different request.
    idempotencyKey: text('idempotency_key'),
    requestHash: text('request_hash'),
    // Null for charges made by the monthly job.
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('ledger_entries_workspace_id_key').on(t.workspaceId, t.id),
    unique('ledger_entries_idempotency_key').on(t.workspaceId, t.idempotencyKey),
    unique('ledger_entries_reverses_key').on(t.workspaceId, t.reversesEntryId),
    unique('ledger_entries_receipt_key').on(t.workspaceId, t.receiptNo),
    uniqueIndex('ledger_entries_monthly_charge_key')
      .on(t.workspaceId, t.studentId, t.groupId, t.period)
      .where(sql`${t.type} = 'charge' and ${t.period} is not null`),
    index('ledger_entries_student_idx').on(t.workspaceId, t.studentId, t.createdAt),
    check(
      'ledger_entries_sign',
      sql`(${t.type} = 'charge' and ${t.amountPiastres} > 0) or (${t.type} = 'payment' and ${t.amountPiastres} < 0) or (${t.type} = 'reversal' and ${t.reversesEntryId} is not null)`,
    ),
    check(
      'ledger_entries_payment_fields',
      sql`${t.type} <> 'payment' or (${t.method} is not null and ${t.receiptNo} is not null)`,
    ),
    foreignKey({
      name: 'ledger_entries_student_fk',
      columns: [t.workspaceId, t.studentId],
      foreignColumns: [students.workspaceId, students.id],
    }),
    foreignKey({
      name: 'ledger_entries_group_fk',
      columns: [t.workspaceId, t.groupId],
      foreignColumns: [groups.workspaceId, groups.id],
    }),
    foreignKey({
      name: 'ledger_entries_enrollment_fk',
      columns: [t.workspaceId, t.enrollmentId],
      foreignColumns: [enrollments.workspaceId, enrollments.id],
    }),
    foreignKey({
      name: 'ledger_entries_reverses_fk',
      columns: [t.workspaceId, t.reversesEntryId],
      foreignColumns: [t.workspaceId, t.id],
    }),
  ],
);

/** Gapless receipt numbers per workspace: UPDATE ... RETURNING inside the payment transaction. */
export const receiptCounters = pgTable('receipt_counters', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id),
  last: integer('last').notNull().default(0),
});

// Messaging (Day 15). Transactional outbox: rows are written in the same transaction as the
// event; the send-outbox job delivers due rows. dedupe_key makes a repeated event a no-op.

export const outboxStatus = pgEnum('outbox_status', ['queued', 'sent', 'failed']);

export const outboxMessages = pgTable(
  'outbox_messages',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    guardianId: uuid('guardian_id').notNull(),
    trigger: text('trigger').notNull(),
    // Snapshot of the event (names, group, time), so the message matches what happened.
    payload: jsonb('payload').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    status: outboxStatus('status').notNull().default('queued'),
    attempts: smallint('attempts').notNull().default(0),
    // Quiet hours and retry backoff both move this forward.
    sendAfter: tz('send_after').notNull(),
    locale: locale('locale'),
    body: text('body'),
    providerMessageId: text('provider_message_id'),
    lastError: text('last_error'),
    sentAt: tz('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('outbox_messages_dedupe_key').on(t.workspaceId, t.dedupeKey),
    index('outbox_messages_due_idx')
      .on(t.sendAfter)
      .where(sql`${t.status} = 'queued'`),
    foreignKey({
      name: 'outbox_messages_guardian_fk',
      columns: [t.workspaceId, t.guardianId],
      foreignColumns: [guardians.workspaceId, guardians.id],
    }),
  ],
);
