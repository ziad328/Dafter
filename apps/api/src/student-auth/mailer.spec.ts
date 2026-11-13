import { describe, expect, it } from 'vitest';
import { BrevoMailer, ConsoleMailer, mailerFromEnv } from './mailer.js';

describe('mailers', () => {
  it('sends through Brevo with the key in a header, and throws on an error status', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let status = 201;
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{"message":"bad"}', { status });
    }) as unknown as typeof fetch;
    const mailer = new BrevoMailer('key-1', 'dafter@example.com', fake);

    await mailer.send('student@example.com', 'Your Dafter code: 123456');
    expect(calls[0]!.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((calls[0]!.init.headers as Record<string, string>)['api-key']).toBe('key-1');
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({
      sender: { email: 'dafter@example.com' },
      to: [{ email: 'student@example.com' }],
      textContent: 'Your Dafter code: 123456',
    });

    status = 401;
    await expect(mailer.send('student@example.com', 'x')).rejects.toThrow('Brevo 401');
  });

  it('picks the mailer from the environment', () => {
    expect(mailerFromEnv({})).toBeInstanceOf(ConsoleMailer);
    expect(
      mailerFromEnv({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k', MAIL_FROM: 'a@b.c' }),
    ).toBeInstanceOf(BrevoMailer);
    expect(() => mailerFromEnv({ MAIL_PROVIDER: 'brevo' })).toThrow('BREVO_API_KEY');
  });
});
