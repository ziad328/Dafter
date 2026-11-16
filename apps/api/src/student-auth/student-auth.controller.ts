import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  type BindDeviceRequest,
  bindDeviceRequest,
  type Device,
  type OtpRequest,
  otpRequest,
  type OtpVerifyRequest,
  otpVerifyRequest,
  type StudentInvitePreview,
} from '@dafter/contracts';
import { withCookie } from '../auth/auth.controller.js';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { ZodPipe } from '../zod-pipe.js';
import { StudentAuthService } from './student-auth.service.js';

@Controller('auth/otp')
export class OtpController {
  constructor(@Inject(StudentAuthService) private readonly service: StudentAuthService) {}

  @Post('request')
  @HttpCode(204)
  async request(@Body(new ZodPipe(otpRequest)) body: OtpRequest, @Req() req: FastifyRequest) {
    await this.service.requestOtp(body, req.ip);
  }

  @Post('verify')
  @HttpCode(200)
  async verify(
    @Body(new ZodPipe(otpVerifyRequest)) body: OtpVerifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return withCookie(reply, await this.service.verifyOtp(body));
  }
}

/**
 * The activation page before sign-in: no AuthGuard, since the student has no login yet. The token
 * (32 random bytes) is the secret; it reveals only first names and the center.
 */
@Controller('student-invites')
export class StudentInvitePreviewController {
  constructor(@Inject(StudentAuthService) private readonly service: StudentAuthService) {}

  @Get(':token')
  preview(
    @Param('token') token: string,
    @Req() req: FastifyRequest,
  ): Promise<StudentInvitePreview> {
    return this.service.previewInvite(token, req.ip);
  }
}

@Controller('devices')
export class DevicesController {
  constructor(@Inject(StudentAuthService) private readonly service: StudentAuthService) {}

  @Post('bind')
  @UseGuards(AuthGuard)
  bind(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(bindDeviceRequest)) body: BindDeviceRequest,
  ): Promise<Device> {
    return this.service.bindDevice(req.userId, body);
  }
}
