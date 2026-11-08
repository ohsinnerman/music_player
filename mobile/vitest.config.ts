import { defineConfig } from 'vitest/config';

// Unit tests for pure TypeScript modules (tag parsing etc.). UI is checked on device / web.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
