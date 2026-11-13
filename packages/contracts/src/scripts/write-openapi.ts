import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpenApi } from '../openapi.js';

const out = join(__dirname, '..', '..', 'openapi.json');
writeFileSync(out, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.log(`Wrote ${out}`);
