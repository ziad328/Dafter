import * as z from 'zod';

// Egyptian mobile: 01 + 9 digits, stored in local form.
export const mobilePhone = z.string().regex(/^01\d{9}$/);
const phone = mobilePhone;
const email = z.email().max(254);
const password = z.string().min(8).max(128);

export const registerRequest = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: phone.optional(),
    email: email.optional(),
    password,
    locale: z.enum(['ar', 'en']).optional(),
  })
  .refine((v) => v.phone || v.email, { path: ['phone'], message: 'phone or email required' })
  .meta({ id: 'RegisterRequest' });

export const loginRequest = z
  .object({
    // Phone or email; the server tells them apart by the "@".
    login: z.string().trim().min(3).max(254),
    password: z.string().min(1).max(128),
  })
  .meta({ id: 'LoginRequest' });

export const me = z
  .object({
    id: z.uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    locale: z.enum(['ar', 'en']),
    // Students sign in with an emailed code and have no password; the web app sends them to /s.
    kind: z.enum(['staff', 'student']),
  })
  .meta({ id: 'Me' });

export const authResponse = z
  .object({ accessToken: z.string(), user: me })
  .meta({ id: 'AuthResponse' });

export const forgotPasswordRequest = z
  .object({ email: z.string().trim().pipe(email) })
  .meta({ id: 'ForgotPasswordRequest' });

export const resetPasswordRequest = z
  .object({ token: z.string().min(1).max(100), password })
  .meta({ id: 'ResetPasswordRequest' });

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequest>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequest>;
export type RegisterRequest = z.infer<typeof registerRequest>;
export type LoginRequest = z.infer<typeof loginRequest>;
export type Me = z.infer<typeof me>;
export type AuthResponse = z.infer<typeof authResponse>;
