// Demo scaffold types (disabled entry only, no journey UI).
// The public demo stays unavailable until Phase 10; this module only
// describes the target contract so later phases do not drift.

export const DEMO_ENABLED = false as const;

export type ClaimKind =
  | 'sourced_fact'
  | 'derived_calculation'
  | 'subjective_judgment'
  | 'unverified_question';

export interface DemoSourceProvenance {
  source_id: string;
  title: string;
  publisher: string;
  visibility: 'shared' | 'private';
  content_hash: string;
  snapshot_date: string;
}

export interface DemoScenarioManifest {
  schema_version: string;
  scenario_id: string;
  content_version: number;
  scenario_revision: number;
  synthetic_only: true;
  instrument_ref: string;
  source_snapshot_date: string;
  allowed_actions: string[];
}

export interface DemoUnavailable {
  code: 'demo_unavailable';
  message: string;
  retryable: false;
  capability: string;
}

export function getDemoUnavailableReason(capability: string): DemoUnavailable {
  return {
    code: 'demo_unavailable',
    message: `demo capability unavailable: ${capability}`,
    retryable: false,
    capability,
  };
}

export function isSyntheticManifest(manifest: DemoScenarioManifest): boolean {
  return (
    manifest.synthetic_only === true &&
    manifest.scenario_id.startsWith('synthetic-') &&
    manifest.instrument_ref.startsWith('SYNTHETIC-')
  );
}
