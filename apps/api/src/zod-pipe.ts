import type { PipeTransform } from '@nestjs/common';
import type * as z from 'zod';
import { AppError } from './errors.js';

/** Validates a body with its contract schema: `@Body(new ZodPipe(loginRequest))`. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    // Field paths and Zod issue codes only: the web app shows its own translated messages.
    throw new AppError('VALIDATION_FAILED', {
      issues: result.error.issues.map((i) => ({
        path: i.path.map(String).join('.'),
        code: i.code,
      })),
    });
  }
}
