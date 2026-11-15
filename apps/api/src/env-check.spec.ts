import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkEnv, fakePhoneOn } from './env-check.js';

afterEach(() => vi.restoreAllMocks());

describe('checkEnv', () => {
  it('refuses DEV_MAIL_INBOX in production only', () => {
    expect(() => checkEnv({ NODE_ENV: 'production', DEV_MAIL_INBOX: '1' })).toThrow(
      /DEV_MAIL_INBOX/,
    );
    expect(() => checkEnv({ DEV_MAIL_INBOX: '1' })).not.toThrow();
    expect(() => checkEnv({ NODE_ENV: 'production' })).not.toThrow();
  });

  it('warns when the fake phone is set in production without DEMO_DEPLOY', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    checkEnv({ NODE_ENV: 'production', DEV_FAKE_PHONE: '1', DEMO_DEPLOY: '1' });
    expect(warn).not.toHaveBeenCalled();
    checkEnv({ NODE_ENV: 'production', DEV_FAKE_PHONE: '1' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DEMO_DEPLOY=1'));
  });
});

describe('fakePhoneOn', () => {
  it('is on in development, and in production only on the demo deploy', () => {
    expect(fakePhoneOn({ DEV_FAKE_PHONE: '1' })).toBe(true);
    expect(fakePhoneOn({})).toBe(false);
    expect(fakePhoneOn({ NODE_ENV: 'production', DEV_FAKE_PHONE: '1' })).toBe(false);
    expect(fakePhoneOn({ NODE_ENV: 'production', DEV_FAKE_PHONE: '1', DEMO_DEPLOY: '1' })).toBe(
      true,
    );
  });
});
