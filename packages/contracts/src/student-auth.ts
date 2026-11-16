import * as z from 'zod';

const email = z.email().max(254);
// Optional on both OTP calls: present on first activation, absent on later logins.
const inviteToken = z.string().min(20).max(100);

export const studentInvite = z
  .object({ token: z.string(), expiresAt: z.iso.datetime() })
  .meta({ id: 'StudentInvite' });

/**
 * The activation page before sign-in (audit 3 SA4): who the link is for and which center sent it.
 * First names only, so a leaked link says little.
 */
export const studentInvitePreview = z
  .object({
    studentFirstNameAr: z.string(),
    studentFirstNameEn: z.string().nullable(),
    workspaceNameAr: z.string(),
    workspaceNameEn: z.string().nullable(),
  })
  .meta({ id: 'StudentInvitePreview' });

export const otpRequest = z
  .object({ email, inviteToken: inviteToken.optional() })
  .meta({ id: 'OtpRequest' });

export const otpVerifyRequest = z
  .object({ email, code: z.string().regex(/^\d{6}$/), inviteToken: inviteToken.optional() })
  .meta({ id: 'OtpVerifyRequest' });

export const bindDeviceRequest = z
  .object({
    // SPKI of an ECDSA P-256 key, base64url. The private key never leaves the phone.
    publicKey: z
      .string()
      .regex(/^[\w-]+$/)
      .max(512),
    label: z.string().trim().min(1).max(100).optional(),
  })
  .meta({ id: 'BindDeviceRequest' });

export const device = z.object({ id: z.uuid(), boundAt: z.iso.datetime() }).meta({ id: 'Device' });

export type StudentInvite = z.infer<typeof studentInvite>;
export type StudentInvitePreview = z.infer<typeof studentInvitePreview>;
export type OtpRequest = z.infer<typeof otpRequest>;
export type OtpVerifyRequest = z.infer<typeof otpVerifyRequest>;
export type BindDeviceRequest = z.infer<typeof bindDeviceRequest>;
export type Device = z.infer<typeof device>;
