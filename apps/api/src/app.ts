import { StatsModule } from './stats/stats.controller.js';
import fastifyCookie from '@fastify/cookie';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { HealthResponse } from '@dafter/contracts';
import { createDb, type Db } from '@dafter/db';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ExamsModule } from './exams/exams.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { CurriculumModule } from './curriculum/curriculum.controller.js';
import { RoomsModule } from './rooms/rooms.controller.js';
import { MeModule } from './me/me.module.js';
import { JobsModule } from './jobs/tick.controller.js';
import { MessagesModule } from './messages/messages.module.js';
import { OutboxSender } from './messages/outbox-sender.js';
import { MoneyModule } from './money/money.module.js';
import { MembersModule } from './members/members.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { StudentAuthModule } from './student-auth/student-auth.module.js';
import { Mailer, mailerFromEnv } from './student-auth/mailer.js';
import { StudentsModule } from './students/students.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { PgRateLimitStore, RateLimitStore } from './auth/rate-limiter.js';
import { Clock } from './clock.js';
import { DB } from './db.js';
import { checkEnv } from './env-check.js';
import { ErrorFilter } from './errors.js';

@Controller('health')
class HealthController {
  // Never touches the database, so uptime pings do not wake Neon.
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    AuthModule,
    WorkspacesModule,
    CurriculumModule,
    RoomsModule,
    MembersModule,
    GroupsModule,
    SessionsModule,
    StudentsModule,
    StudentAuthModule,
    AttendanceModule,
    MeModule,
    MoneyModule,
    MessagesModule,
    JobsModule,
    StatsModule,
    ExamsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
class AppModule {}

/** Tests pass their own database and clock; otherwise DATABASE_URL and the system clock are used. */
export async function createApp(
  options: { logger?: false; db?: Db; clock?: Clock; mailer?: Mailer } = {},
) {
  checkEnv();
  let db = options.db;
  let closeDb = async () => {};
  if (!db) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    const created = createDb(process.env.DATABASE_URL);
    db = created.db;
    closeDb = () => created.pool.end();
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    {
      module: AppModule,
      global: true,
      providers: [
        { provide: DB, useValue: db },
        { provide: Clock, useValue: options.clock ?? new Clock() },
        { provide: Mailer, useValue: options.mailer ?? mailerFromEnv() },
        OutboxSender,
        { provide: RateLimitStore, useClass: PgRateLimitStore },
      ],
      exports: [DB, Clock, Mailer, OutboxSender, RateLimitStore],
    },
    // Behind the host's proxy (Vercel) req.ip comes from X-Forwarded-For; never trust it locally.
    new FastifyAdapter({ trustProxy: process.env.TRUST_PROXY === '1' }),
    { logger: options.logger },
  );
  app.getHttpAdapter().getInstance().addHook('onClose', closeDb);
  await app.register(fastifyCookie);
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  return app;
}
