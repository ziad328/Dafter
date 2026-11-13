import fastifyCookie from '@fastify/cookie';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { HealthResponse } from '@dafter/contracts';
import { createDb, type Db } from '@dafter/db';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuthModule } from './auth/auth.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { MeModule } from './me/me.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { MoneyModule } from './money/money.module.js';
import { MembersModule } from './members/members.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { StudentAuthModule } from './student-auth/student-auth.module.js';
import { ConsoleMailer, Mailer } from './student-auth/mailer.js';
import { StudentsModule } from './students/students.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { Clock } from './clock.js';
import { DB } from './db.js';
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
    MembersModule,
    GroupsModule,
    SessionsModule,
    StudentsModule,
    StudentAuthModule,
    AttendanceModule,
    MeModule,
    MoneyModule,
    MessagesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
class AppModule {}

/** Tests pass their own database and clock; otherwise DATABASE_URL and the system clock are used. */
export async function createApp(
  options: { logger?: false; db?: Db; clock?: Clock; mailer?: Mailer } = {},
) {
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
        // shortcut: console only; Day 17 picks a real provider when MAIL_PROVIDER is set.
        { provide: Mailer, useValue: options.mailer ?? new ConsoleMailer() },
      ],
      exports: [DB, Clock, Mailer],
    },
    new FastifyAdapter(),
    { logger: options.logger },
  );
  app.getHttpAdapter().getInstance().addHook('onClose', closeDb);
  await app.register(fastifyCookie);
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  return app;
}
