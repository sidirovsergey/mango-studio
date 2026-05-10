import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': new URL('./src/__mocks__/server-only.ts', import.meta.url).pathname,
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
