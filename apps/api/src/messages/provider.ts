import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';

/** Port for parent messages. v0 only has ConsoleProvider; WhatsApp comes after v0. */
export abstract class MessageProvider {
  /** Resolves with the provider's message id; throws to trigger a retry. */
  abstract send(phone: string, body: string): Promise<string>;
}

/** Development and demos: logs the message; the fake-phone page reads the sent body from the outbox. */
export class ConsoleProvider extends MessageProvider {
  private readonly logger = new Logger('Messages');

  async send(phone: string, body: string) {
    if (process.env.NODE_ENV !== 'production') this.logger.log(`to=${phone} ${body}`);
    return `console-${randomUUID()}`;
  }
}
