import { seed } from '../seed.js';
import { databaseUrl } from './env.js';

seed(databaseUrl()).then(
  () => console.log('Seeded demo center'),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
