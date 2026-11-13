import { BadRequestException, ForbiddenException, ImATeapotException } from '@nestjs/common';
import { expect, it } from 'vitest';
import { AppError, toErrorResponse } from './errors.js';

it('passes an AppError code and details through', () => {
  expect(toErrorResponse(new AppError('CONFLICT', { field: 'phone' }))).toEqual({
    code: 'CONFLICT',
    details: { field: 'phone' },
  });
  expect(toErrorResponse(new AppError('NOT_FOUND'))).toEqual({ code: 'NOT_FOUND' });
});

it('maps Nest exceptions by status and drops their English message', () => {
  expect(toErrorResponse(new BadRequestException('Body is not valid JSON'))).toEqual({
    code: 'VALIDATION_FAILED',
  });
  expect(toErrorResponse(new ForbiddenException())).toEqual({ code: 'FORBIDDEN' });
  expect(toErrorResponse(new ImATeapotException())).toEqual({ code: 'INTERNAL' });
});

it('hides unexpected errors behind INTERNAL', () => {
  expect(toErrorResponse(new Error('connection string with a password'))).toEqual({
    code: 'INTERNAL',
  });
});
