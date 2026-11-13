import { Logger } from '@nestjs/common';

// shortcut: no jobs yet, so a standalone run exits at once; pg-boss keeps it alive from Day 9.
export async function startWorker() {
  new Logger('Worker').log('Worker started (no jobs registered yet)');
}

if (require.main === module) void startWorker();
