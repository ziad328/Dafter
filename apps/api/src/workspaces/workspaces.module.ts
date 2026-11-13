import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TenantGuard } from './tenant.guard.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesRepository } from './workspaces.repository.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [AuthModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository, TenantGuard],
  // Feature modules import this module to put TenantGuard on their routes.
  exports: [TenantGuard, WorkspacesRepository],
})
export class WorkspacesModule {}
