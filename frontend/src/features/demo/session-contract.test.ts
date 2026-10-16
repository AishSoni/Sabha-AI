// Phase 08: demo session contract constants (no behavior until Phase 10).
import { describe, expect, it } from 'vitest';

import {
  DEMO_AUTH_SCHEME,
  DEMO_ENABLED,
  DEMO_SESSION_STORAGE_KEY,
  demoAuthHeader,
  getDemoUnavailableReason,
} from './types';

describe('demo session contract', () => {
  it('marks the guided entry implemented pending hosted release checks', () => {
    expect(DEMO_ENABLED).toBe(true);
  });

  it('pins the sessionStorage key and bearer header shape', () => {
    expect(DEMO_SESSION_STORAGE_KEY).toBe('sabha.demo.sessionToken');
    expect(DEMO_AUTH_SCHEME).toBe('Bearer');
    expect(demoAuthHeader('opaque-token')).toBe('Bearer opaque-token');
  });

  it('still reports typed unavailable for disabled capabilities', () => {
    expect(getDemoUnavailableReason('guided_actions')).toEqual({
      code: 'demo_unavailable',
      message: 'demo capability unavailable: guided_actions',
      retryable: false,
      capability: 'guided_actions',
    });
  });
});
