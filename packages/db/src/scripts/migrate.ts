import { runMigrations } from '../migrate.js';
import { databaseUrl } from './env.js';

export async function main() {
  await runMigrations(databaseUrl());
  console.log('Migrations applied');
}

// Run by tsx from package.json; tests import main() instead.
/* v8 ignore next 4 */
if (require.main === module)
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
