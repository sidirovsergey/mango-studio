import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // server-only throws unconditionally in non-Next.js environments.
      // In vitest (Node runner) we stub it as a no-op so Faraday-cage
      // imports don't abort test collection.
      'server-only': new URL('./src/__mocks__/server-only.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
