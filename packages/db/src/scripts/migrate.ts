import { runMigrations } from '../migrate.js';
import { databaseUrl } from './env.js';

runMigrations(databaseUrl()).then(
  () => console.log('Migrations applied'),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
