import * as z from 'zod';
import { curriculumItem } from './groups.js';

export const paymentMethod = z.enum(['cash', 'vodafone_cash', 'instapay']);
export const ledgerEntryType = z.enum(['charge', 'payment', 'reversal']);

/** Integer piastres (150.50 EGP = 15050). Never a float. */
const piastres = z.int().min(1).max(10_000_000);

export const createPaymentRequest = z
  .object({
    studentId: z.uuid(),
    // The group the payment is for; it decides who may record it.
    groupId: z.uuid(),
    amountPiastres: piastres,
    method: paymentMethod,
    note: z.string().trim().min(1).max(200).optional(),
  })
  .meta({ id: 'CreatePaymentRequest' });

export const ledgerEntry = z
  .object({
    id: z.uuid(),
    type: ledgerEntryType,
    // Signed: charge > 0, payment < 0, reversal = minus the reversed entry.
    amountPiastres: z.int(),
    method: paymentMethod.nullable(),
    receiptNo: z.int().nullable(),
    period: z.string().nullable(),
    groupId: z.uuid(),
    subject: curriculumItem,
    reversesEntryId: z.uuid().nullable(),
    // Set when a later entry reversed this one.
    reversedById: z.uuid().nullable(),
    note: z.string().nullable(),
    createdByName: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'LedgerEntry' });

export const studentLedger = z
  .object({
    // Sum of the entries the caller can see: > 0 means the student owes.
    balancePiastres: z.int(),
    entries: z.array(ledgerEntry),
  })
  .meta({ id: 'StudentLedger' });

export const receipt = z
  .object({
    entry: ledgerEntry,
    studentName: z.string(),
    center: z.object({ nameAr: z.string(), nameEn: z.string().nullable() }),
    timezone: z.string(),
  })
  .meta({ id: 'Receipt' });

export type CreatePaymentRequest = z.infer<typeof createPaymentRequest>;
export type LedgerEntry = z.infer<typeof ledgerEntry>;
export type StudentLedger = z.infer<typeof studentLedger>;
export type Receipt = z.infer<typeof receipt>;
