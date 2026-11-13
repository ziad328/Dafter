import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../migrate.js';
import { TEMPLATE_DB } from './template.js';

// One container per test run: migrate a template once; each test file clones it (see test-db.ts).
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17').withDatabase(TEMPLATE_DB).start();
  await runMigrations(container.getConnectionUri());
  project.provide('pgUrl', container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
