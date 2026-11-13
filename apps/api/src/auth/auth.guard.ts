import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';
import { AuthService } from './auth.service.js';

export type AuthedRequest = FastifyRequest & { userId: string };

/** Requires `Authorization: Bearer <access JWT>` and puts the user id on the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new AppError('UNAUTHENTICATED');
    req.userId = this.auth.verifyAccess(token);
    return true;
  }
}
