import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./src/testing/global-setup.ts'],
    // The first run pulls postgres:17.
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
