import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as z from 'zod';
import {
  type CreatePaymentRequest,
  createPaymentRequest,
  type LedgerEntry,
  type Receipt,
  type StudentLedger,
} from '@dafter/contracts';
import type { AuditedRequest } from '../audit.interceptor.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { TenantGuard, type TenantedRequest } from '../workspaces/tenant.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { MoneyService } from './money.service.js';

const uuid = new ZodPipe(z.uuid());

@Controller()
@UseGuards(AuthGuard, TenantGuard)
export class MoneyController {
  constructor(@Inject(MoneyService) private readonly money: MoneyService) {}

  @Get('students/:id/ledger')
  ledger(@Req() req: TenantedRequest, @Param('id', uuid) id: string): Promise<StudentLedger> {
    return this.money.ledger(req, id);
  }

  @Post('payments')
  async pay(
    @Req() req: TenantedRequest & AuditedRequest,
    @Body(new ZodPipe(createPaymentRequest)) body: CreatePaymentRequest,
    @Headers('idempotency-key') key: unknown,
  ): Promise<LedgerEntry> {
    const entry = await this.money.pay(req, body, key);
    req.audit = { entityId: entry.id };
    return entry;
  }

  @Post('ledger/:id/reverse')
  reverse(
    @Req() req: TenantedRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: unknown,
  ): Promise<LedgerEntry> {
    return this.money.reverse(req, id, key);
  }

  @Get('ledger/:id/receipt')
  receipt(@Req() req: TenantedRequest, @Param('id', uuid) id: string): Promise<Receipt> {
    return this.money.receipt(req, id);
  }
}
