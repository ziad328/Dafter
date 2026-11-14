import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'virtual:pwa-register': fileURLToPath(new URL('./src/test/pwa-register.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // An absolute API origin: Node's fetch rejects the relative URLs the browser accepts.
    env: { VITE_API_URL: 'http://localhost:3000' },
    setupFiles: ['./src/test/setup.ts'],
    expect: { poll: { timeout: 5000 } },
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        // Generated from the contracts by RTK codegen; CI checks it is up to date.
        'src/api/generated.ts',
        // Copied in by the shadcn CLI, not written here.
        'src/components/ui/**',
      ],
      thresholds: { lines: 100 },
      reporter: ['text-summary', 'text'],
    },
  },
});
