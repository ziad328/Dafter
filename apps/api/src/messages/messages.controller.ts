import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  type ListMessagesQuery,
  listMessagesQuery,
  type MessageSettings,
  messageSettings,
  type OutboxMessage,
  type SentMessage,
} from '@dafter/contracts';
import { guardians, outboxMessages, workspaces } from '@dafter/db';
import type { AuditedRequest } from '../audit.interceptor.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AppError } from '../errors.js';
import { TenantRepository } from '../tenant.repository.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { ZodPipe } from '../zod-pipe.js';

const iso = (d: Date | null) => d && d.toISOString();

@Injectable()
export class MessagesRepository extends TenantRepository {
  async log(workspaceId: string, status?: ListMessagesQuery['status']): Promise<OutboxMessage[]> {
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
          createdAt: outboxMessages.createdAt,
        })
        .from(outboxMessages)
        .innerJoin(guardians, eq(guardians.id, outboxMessages.guardianId))
        .where(
          and(
            eq(outboxMessages.workspaceId, workspaceId),
            status && eq(outboxMessages.status, status),
          ),
        )
        .orderBy(desc(outboxMessages.createdAt))
        .limit(100),
    );
    return rows.map((r) => ({
      ...r,
      trigger: r.trigger as OutboxMessage['trigger'],
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
    return { absence: true, sessionChange: true, examResult: true, ...row?.messages };
  }

  async setSettings(workspaceId: string, value: MessageSettings) {
    await this.inTenant(workspaceId, (tx) =>
      tx
        .update(workspaces)
        .set({
          settings: sql`${workspaces.settings} || jsonb_build_object('messages', ${JSON.stringify(value)}::jsonb)`,
        })
        .where(eq(workspaces.id, workspaceId)),
    );
    return value;
  }
}

@Controller()
@UseGuards(AuthGuard, TenantGuard)
export class MessagesController {
  constructor(@Inject(MessagesRepository) private readonly repo: MessagesRepository) {}

  /** Owner and assistant: the log shows every parent's phone, so teachers don't get it. */
  @Get('messages')
  log(
    @Req() req: TenantedRequest,
    @Query(new ZodPipe(listMessagesQuery)) q: ListMessagesQuery,
  ): Promise<OutboxMessage[]> {
    if (req.role === 'teacher') throw new AppError('FORBIDDEN');
    return this.repo.log(req.workspaceId, q.status);
  }

  @Get('message-settings')
  settings(@Req() req: TenantedRequest): Promise<MessageSettings> {
    return this.repo.settings(req.workspaceId);
  }

  @Put('message-settings')
  setSettings(
    @Req() req: TenantedRequest & AuditedRequest,
    @Body(new ZodPipe(messageSettings)) body: MessageSettings,
  ): Promise<MessageSettings> {
    if (req.role !== 'owner') throw new AppError('FORBIDDEN');
    req.audit = { entityId: req.workspaceId };
    return this.repo.setSettings(req.workspaceId, body);
  }
}

/**
 * Development and demos only (DEV_FAKE_PHONE=1): what the console provider "delivered". Read
 * from the outbox, since the worker may run in another process. Checked per request, because
 * main.ts loads .env after the modules are imported.
 */
@Controller('dev/phone')
@UseGuards(AuthGuard, TenantGuard)
export class FakePhoneController {
  constructor(@Inject(MessagesRepository) private readonly repo: MessagesRepository) {}

  @Get()
  list(@Req() req: TenantedRequest) {
    if (process.env.DEV_FAKE_PHONE !== '1') throw new AppError('NOT_FOUND');
    return this.repo.sent(req.workspaceId);
  }
}
