import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpenApi } from '../openapi.js';

export const OPENAPI_FILE = join(__dirname, '..', '..', 'openapi.json');

/** Writes the OpenAPI document (pnpm contracts:gen); CI fails if the committed copy differs. */
export function writeOpenApi(out = OPENAPI_FILE) {
  writeFileSync(out, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
  console.log(`Wrote ${out}`);
}

// Run by tsx from package.json; tests call writeOpenApi() instead.
/* v8 ignore next */
if (require.main === module) writeOpenApi();
