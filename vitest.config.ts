import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    // v1.0.0 (H2). The seed/integrity tests seed the full 1,324-exercise
    // library into IndexedDB and legitimately take 2-5s+ each; the vitest
    // default of 5s caused intermittent false timeouts under parallel load.
    // Raising the timeout corrects that without weakening any assertion.
    testTimeout: 15000,
  },
});
