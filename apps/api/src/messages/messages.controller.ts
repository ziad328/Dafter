import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  type CustomTemplates,
  DEFAULT_TEMPLATES,
  type ListMessagesQuery,
  listMessagesQuery,
  type MessageSettings,
  updateMessageSettingsRequest,
  type UpdateMessageSettingsRequest,
  type MessageTemplate,
  messageTrigger,
  type OutboxMessage,
  type SentMessage,
  TEMPLATE_PLACEHOLDERS,
  unknownPlaceholder,
  type UpdateMessageTemplateRequest,
  updateMessageTemplateRequest,
} from '@dafter/contracts';
import { guardians, outboxMessages, workspaces } from '@dafter/db';
import type { AuditedRequest } from '../audit.interceptor.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { fakePhoneOn } from '../env-check.js';
import { AppError } from '../errors.js';
import { TenantRepository } from '../tenant.repository.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { OVERDUE_FROM_DAY } from './outbox.js';

const iso = (d: Date | null) => d && d.toISOString();

/** All but the last 3 characters become •, so a teacher can tell guardians apart without the number. */
export const maskPhone = (phone: string) =>
  '•'.repeat(Math.max(0, phone.length - 3)) + phone.slice(-3);

/**
 * The message is about one of this teacher's groups: through its session (absences, cancelled or
 * moved sessions) or its exam. Fee reminders are center-wide, so they never match.
 */
const ofTeacher = (teacherId: string) => sql`(
  exists (select 1 from sessions s join groups g on g.id = s.group_id
          where s.workspace_id = ${outboxMessages.workspaceId}
            and s.id = (${outboxMessages.payload}->>'sessionId')::uuid
            and g.teacher_membership_id = ${teacherId})
  or exists (select 1 from exams e join groups g on g.id = e.group_id
             where e.workspace_id = ${outboxMessages.workspaceId}
               and e.id = (${outboxMessages.payload}->>'examId')::uuid
               and g.teacher_membership_id = ${teacherId}))`;

@Injectable()
export class MessagesRepository extends TenantRepository {
  /** The newest 100; with `teacherId`, only that teacher's groups and with masked phones. */
  async log(
    workspaceId: string,
    status?: ListMessagesQuery['status'],
    teacherId?: string,
  ): Promise<OutboxMessage[]> {
    const rows = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({
          id: outboxMessages.id,
          trigger: outboxMessages.trigger,
          status: outboxMessages.status,
          phone: guardians.phone,
          guardianName: guardians.name,
          students: sql<string[]>`(select coalesce(jsonb_agg(s->>'nameAr'), '[]'::jsonb)
                                   from jsonb_array_elements(${outboxMessages.payload}->'students') s)`,
          locale: outboxMessages.locale,
          attempts: outboxMessages.attempts,
          sendAfter: outboxMessages.sendAfter,
          sentAt: outboxMessages.sentAt,
          body: outboxMessages.body,
          lastError: outboxMessages.lastError,
          skipReason: outboxMessages.skipReason,
          createdAt: outboxMessages.createdAt,
        })
        .from(outboxMessages)
        .innerJoin(guardians, eq(guardians.id, outboxMessages.guardianId))
        .where(
          and(
            eq(outboxMessages.workspaceId, workspaceId),
            status && eq(outboxMessages.status, status),
            teacherId ? ofTeacher(teacherId) : undefined,
          ),
        )
        .orderBy(desc(outboxMessages.createdAt))
        .limit(100),
    );
    return rows.map((r) => ({
      ...r,
      phone: teacherId ? maskPhone(r.phone) : r.phone,
      // A provider's error text can name the number, so a teacher doesn't get it.
      lastError: teacherId ? null : r.lastError,
      trigger: r.trigger as OutboxMessage['trigger'],
      skipReason: r.skipReason as OutboxMessage['skipReason'],
      sendAfter: r.sendAfter.toISOString(),
      sentAt: iso(r.sentAt),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async sent(workspaceId: string): Promise<SentMessage[]> {
    const rows = await this.log(workspaceId, 'sent');
    return rows.map((r) => ({
      id: r.id,
      phone: r.phone,
      guardianName: r.guardianName,
      locale: r.locale ?? 'ar',
      body: r.body ?? '',
      sentAt: r.sentAt!,
    }));
  }

  async settings(workspaceId: string): Promise<MessageSettings> {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({
          messages: sql<Partial<MessageSettings> | null>`${workspaces.settings}->'messages'`,
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId)),
    );
    // Picked one by one: an old save may still hold the retired center-wide `primaryOnly`.
    const m = row?.messages ?? {};
    return {
      absence: m.absence ?? true,
      sessionChange: m.sessionChange ?? true,
      examResult: m.examResult ?? true,
      feeOverdue: m.feeOverdue ?? false,
      feeReminderFromDay: m.feeReminderFromDay ?? OVERDUE_FROM_DAY,
    };
  }

  /** Merged into the saved settings, so a field left out (an older page) keeps its value. */
  async setSettings(workspaceId: string, value: UpdateMessageSettingsRequest) {
    await this.inTenant(workspaceId, (tx) =>
      tx
        .update(workspaces)
        .set({
          settings: sql`jsonb_set(${workspaces.settings}, '{messages}', coalesce(${workspaces.settings}->'messages', '{}') || ${JSON.stringify(value)}::jsonb)`,
        })
        .where(eq(workspaces.id, workspaceId)),
    );
    return this.settings(workspaceId);
  }
}

type Trigger = MessageTemplate['trigger'];

/** Each trigger with its placeholders, default and custom wording. */
function templateList(custom: CustomTemplates): MessageTemplate[] {
  return messageTrigger.options.map((trigger) => one(trigger, custom));
}

function one(trigger: Trigger, custom: CustomTemplates): MessageTemplate {
  const locale = (l: 'ar' | 'en') => ({
    default: DEFAULT_TEMPLATES[trigger][l],
    custom: custom[trigger]?.[l] || null,
  });
  return {
    trigger,
    placeholders: [...TEMPLATE_PLACEHOLDERS[trigger]],
    ar: locale('ar'),
    en: locale('en'),
  };
}

@Injectable()
export class TemplatesRepository extends TenantRepository {
  async get(workspaceId: string): Promise<CustomTemplates> {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .select({ templates: sql<CustomTemplates | null>`${workspaces.settings}->'templates'` })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId)),
    );
    return row?.templates ?? {};
  }

  /** Replaces one trigger's wording; the other triggers and settings are kept. */
  async set(workspaceId: string, trigger: Trigger, value: UpdateMessageTemplateRequest) {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .update(workspaces)
        .set({
          settings: sql`${workspaces.settings} || jsonb_build_object('templates',
            coalesce(${workspaces.settings}->'templates', '{}'::jsonb)
              || jsonb_build_object(${trigger}::text, ${JSON.stringify(value)}::jsonb))`,
        })
        .where(eq(workspaces.id, workspaceId))
        .returning({ templates: sql<CustomTemplates>`${workspaces.settings}->'templates'` }),
    );
    return row!.templates;
  }
}

@Controller()
@UseGuards(AuthGuard, TenantGuard)
export class MessagesController {
  constructor(
    @Inject(MessagesRepository) private readonly repo: MessagesRepository,
    @Inject(TemplatesRepository) private readonly templates: TemplatesRepository,
  ) {}

  /**
   * Owner and assistant: every message. A teacher: their own groups' messages, with each phone
   * masked here (never only in the UI) except the last 3 digits.
   */
  @Get('messages')
  log(
    @Req() req: TenantedRequest,
    @Query(new ZodPipe(listMessagesQuery)) q: ListMessagesQuery,
  ): Promise<OutboxMessage[]> {
    const teacher = req.role === 'teacher' ? req.membershipId : undefined;
    return this.repo.log(req.workspaceId, q.status, teacher);
  }

  @Get('message-settings')
  settings(@Req() req: TenantedRequest): Promise<MessageSettings> {
    return this.repo.settings(req.workspaceId);
  }

  @Put('message-settings')
  setSettings(
    @Req() req: TenantedRequest & AuditedRequest,
    @Body(new ZodPipe(updateMessageSettingsRequest)) body: UpdateMessageSettingsRequest,
  ): Promise<MessageSettings> {
    if (req.role !== 'owner') throw new AppError('FORBIDDEN');
    req.audit = { entityId: req.workspaceId };
    return this.repo.setSettings(req.workspaceId, body);
  }

  /** Owner and assistant, like the log: the wording parents get. */
  @Get('message-templates')
  async listTemplates(@Req() req: TenantedRequest): Promise<MessageTemplate[]> {
    if (req.role === 'teacher') throw new AppError('FORBIDDEN');
    return templateList(await this.templates.get(req.workspaceId));
  }

  /** Owner only. Empty text is stored as null (the default); unknown placeholders are refused. */
  @Put('message-templates/:trigger')
  async setTemplate(
    @Req() req: TenantedRequest & AuditedRequest,
    @Param('trigger', new ZodPipe(messageTrigger)) trigger: Trigger,
    @Body(new ZodPipe(updateMessageTemplateRequest)) body: UpdateMessageTemplateRequest,
  ): Promise<MessageTemplate> {
    if (req.role !== 'owner') throw new AppError('FORBIDDEN');
    // The default text is stored as null too, so a later change of the default reaches it.
    const own = (l: 'ar' | 'en') =>
      body[l] && body[l] !== DEFAULT_TEMPLATES[trigger][l] ? body[l] : null;
    const value = { ar: own('ar'), en: own('en') };
    for (const locale of ['ar', 'en'] as const) {
      const placeholder = value[locale] && unknownPlaceholder(trigger, value[locale]);
      if (placeholder) throw new AppError('TEMPLATE_PLACEHOLDER_UNKNOWN', { placeholder, locale });
    }
    req.audit = { entityId: req.workspaceId };
    return one(trigger, await this.templates.set(req.workspaceId, trigger, value));
  }
}

/**
 * Development and the demo deploy only (`fakePhoneOn`): what the console provider "delivered".
 * Read from the outbox, since the worker may run in another process.
 */
@Controller('dev/phone')
@UseGuards(AuthGuard, TenantGuard)
export class FakePhoneController {
  constructor(@Inject(MessagesRepository) private readonly repo: MessagesRepository) {}

  @Get()
  list(@Req() req: TenantedRequest) {
    if (!fakePhoneOn()) throw new AppError('NOT_FOUND');
    return this.repo.sent(req.workspaceId);
  }
}
