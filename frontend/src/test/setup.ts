// Phase 01 (P01-T05) shared Vitest setup: DOM matchers, storage and
// timer hygiene. Every test starts with clean storage and real timers;
// individual suites opt into fakes explicitly.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom always provides localStorage; ignore otherwise */
  }
  try {
    window.sessionStorage.clear();
  } catch {
    /* ignore */
  }
});
