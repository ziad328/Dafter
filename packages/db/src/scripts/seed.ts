import { seed } from '../seed.js';
import { databaseUrl } from './env.js';

export async function main() {
  await seed(databaseUrl());
  console.log('Seeded demo center');
}

// Run by tsx from package.json; tests import main() instead.
/* v8 ignore next 4 */
if (require.main === module)
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
