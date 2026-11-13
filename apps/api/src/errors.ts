import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ERROR_STATUS, type ErrorCode, type ErrorResponse } from '@dafter/contracts';

/** Throw this from services: the client receives { code, details } and translates the code. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = Object.fromEntries(
  Object.entries(ERROR_STATUS).map(([code, status]) => [status, code as ErrorCode]),
);

export function toErrorResponse(err: unknown): ErrorResponse {
  if (err instanceof AppError)
    return err.details ? { code: err.code, details: err.details } : { code: err.code };
  // Nest's own exceptions (unknown route, malformed JSON) carry a status but an English message.
  if (err instanceof HttpException) return { code: CODE_BY_STATUS[err.getStatus()] ?? 'INTERNAL' };
  return { code: 'INTERNAL' };
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const body = toErrorResponse(err);
    if (body.code === 'INTERNAL') this.logger.error(err);
    host
      .switchToHttp()
      .getResponse<{ status(code: number): { send(payload: unknown): unknown } }>()
      .status(ERROR_STATUS[body.code])
      .send(body);
  }
}
