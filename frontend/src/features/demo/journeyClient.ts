// Demo bootstrap support: scenario constants + sessionStorage credential.
// The guided single-bond walkthrough lives in components/demo (overlay +
// watermark) and lib/demoGuide* (journey store + API). This module only keeps
// the shared constants and token helpers the watermarked surfaces read.

export const BOND_SCENARIO_ID = 'indian-corporate-bond-review';
export const BOND_CONTENT_REVISION = 1;
export const VERIFIED_ISIN = 'INE001A07RW5';
export const BOND_SNAPSHOT_DATE = '2020-07-31';

// Credential contract: sessionStorage only (never localStorage, never URLs),
// travels as an `Authorization: Bearer` header, stored server-side as a hash.
export const DEMO_SESSION_STORAGE_KEY = 'sabha.demo.sessionToken' as const;

export function loadDemoToken(): string | null {
  try {
    return sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveDemoToken(token: string): void {
  sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY, token);
}

export function clearDemoToken(): void {
  sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
}
