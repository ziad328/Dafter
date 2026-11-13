import '@fastify/cookie';
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  type AuthResponse,
  type LoginRequest,
  loginRequest,
  type Me,
  type RegisterRequest,
  registerRequest,
} from '@dafter/contracts';
import { ZodPipe } from '../zod-pipe.js';
import { AuthGuard, type AuthedRequest } from './auth.guard.js';
import { AuthService, REFRESH_TTL_MS, type Session } from './auth.service.js';

export const REFRESH_COOKIE = 'rt';
// Only the auth routes ever receive the refresh cookie.
const COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body(new ZodPipe(registerRequest)) body: RegisterRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return withCookie(reply, await this.auth.register(body));
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginRequest)) body: LoginRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return withCookie(reply, await this.auth.login(body, req.ip));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      return withCookie(reply, await this.auth.refresh(req.cookies[REFRESH_COOKIE]));
    } catch (err) {
      reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(req.cookies[REFRESH_COOKIE]);
    reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }
}

@Controller('me')
export class MeController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest): Promise<Me> {
    return this.auth.me(req.userId);
  }
}

function withCookie(reply: FastifyReply, { refreshToken, ...body }: Session): AuthResponse {
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL_MS / 1000,
  });
  return body;
}
