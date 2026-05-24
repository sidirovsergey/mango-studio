import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'server-only': new URL('./src/__mocks__/server-only.ts', import.meta.url).pathname,
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    environmentMatchGlobs: [['src/components/**/*.test.{ts,tsx}', 'jsdom']],
    poolOptions: {
      forks: {
        execArgv: ['--max-old-space-size=8192'],
      },
    },
  },
});
