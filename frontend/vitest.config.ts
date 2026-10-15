import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Phase 01 (P01-T05): single Vitest runner, no browser-provider dependency.
// Store/parser tests run in the same jsdom environment as component tests
// so sessionStorage, fetch mocks and DOM matchers behave identically.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    // B-09 owned by Phase 07: it.fails unexpected-pass detection is on.
    // A stale marker fails the suite so it cannot linger silently.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
