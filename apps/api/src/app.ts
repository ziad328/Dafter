import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { HealthResponse } from '@dafter/contracts';
import { ErrorFilter } from './errors.js';

@Controller('health')
class HealthController {
  // Never touches the database, so uptime pings do not wake Neon.
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

export async function createApp(options: { logger?: false } = {}) {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    options,
  );
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  return app;
}
