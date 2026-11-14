import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dbSrc = (p: string) => fileURLToPath(new URL(`../../packages/db/src/${p}`, import.meta.url));

export default defineConfig({
  // Tests use @dafter/db from source (the built dist is CommonJS for the Nest runtime).
  resolve: {
    alias: [
      { find: /^@dafter\/db\/testing$/, replacement: dbSrc('testing/index.ts') },
      { find: /^@dafter\/db$/, replacement: dbSrc('index.ts') },
    ],
  },
  test: {
    globalSetup: [dbSrc('testing/global-setup.ts')],
    env: { JWT_SECRET: 'test-secret', QR_SECRET: 'test-qr-secret' },
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // Every line of src is run by a test; specs and test helpers are not counted.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/testing/**'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 100 },
    },
  },
});
