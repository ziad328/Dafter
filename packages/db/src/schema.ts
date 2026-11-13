import { sql } from 'drizzle-orm';
import {
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
