import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Db } from '@dafter/db';
import { Clock } from '../clock.js';
import { DB } from '../db.js';
import { requestTx } from '../request-tx.js';
import { sendDueMessages } from '../jobs/send-outbox.js';
import { ConsoleProvider } from './provider.js';

/**
 * Sends due outbox rows from inside the API. The tick route uses it for every workspace; with
 * OUTBOX_SEND_INLINE=1 (serverless hosts, where no worker polls) the writes that enqueue messages
 * also flush their workspace right after commit, so a message needs no cron to leave. Rows held by
 * quiet hours or a retry backoff stay for the next tick.
 */
@Injectable()
export class OutboxSender {
  private readonly logger = new Logger('Outbox');
  private readonly provider = new ConsoleProvider();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  sendAll() {
    return sendDueMessages(this.db, this.clock, this.provider);
  }

  /**
   * After a committed write; never fails the request (the row stays queued for the next tick).
   * Inside a request transaction it waits for that commit: the sender's own connection can't see
   * uncommitted rows.
   */
  async afterCommit(workspaceId: string) {
    if (process.env.OUTBOX_SEND_INLINE !== '1') return;
    const current = requestTx.getStore();
    if (current) {
      current.after.push(() => this.flush(workspaceId));
      return;
    }
    await this.flush(workspaceId);
  }

  private async flush(workspaceId: string) {
    try {
      await sendDueMessages(this.db, this.clock, this.provider, workspaceId);
    } catch (err) {
      this.logger.error(err);
    }
  }
}
