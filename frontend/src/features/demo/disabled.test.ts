import { describe, expect, it } from 'vitest';

import {
  DEMO_ENABLED,
  getDemoUnavailableReason,
  isSyntheticManifest,
} from './types';

describe('demo journey entry (implemented locally)', () => {
  it('marks the guided entry implemented pending hosted release checks', () => {
    expect(DEMO_ENABLED).toBe(true);
  });

  it('reports typed unavailable instead of fabricated success', () => {
    const reason = getDemoUnavailableReason('real_scenario_bootstrap');
    expect(reason.code).toBe('demo_unavailable');
    expect(reason.retryable).toBe(false);
  });

  it('accepts only visibly synthetic scaffold manifests', () => {
    expect(
      isSyntheticManifest({
        schema_version: '1',
        scenario_id: 'synthetic-smoke-scaffold',
        content_version: 1,
        scenario_revision: 1,
        synthetic_only: true,
        instrument_ref: 'SYNTHETIC-TEST-INSTRUMENT',
        source_snapshot_date: '2026-01-01',
        allowed_actions: ['synthetic_smoke'],
      }),
    ).toBe(true);
    expect(
      isSyntheticManifest({
        schema_version: '1',
        scenario_id: 'indian-corporate-bond-review',
        content_version: 1,
        scenario_revision: 1,
        synthetic_only: true,
        instrument_ref: 'SYNTHETIC-TEST-INSTRUMENT',
        source_snapshot_date: '2026-01-01',
        allowed_actions: [],
      }),
    ).toBe(false);
  });
});
