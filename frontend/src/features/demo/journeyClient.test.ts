import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  BOND_SCENARIO_ID,
  BOND_CONTENT_REVISION,
  VERIFIED_ISIN,
  loadDemoToken,
  saveDemoToken,
  clearDemoToken,
  demoFetch,
} from './journeyClient';
import { DEMO_SESSION_STORAGE_KEY, demoAuthHeader } from './types';

beforeEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('bond journey client', () => {
  it('pins the approved single-bond scenario identity', () => {
    expect(BOND_SCENARIO_ID).toBe('indian-corporate-bond-review');
    expect(VERIFIED_ISIN).toBe('INE001A07RW5');
    expect(BOND_CONTENT_REVISION).toBe(1);
  });

  it('keeps the token in sessionStorage only', () => {
    saveDemoToken('tok-123');
    expect(window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBe(
      'tok-123',
    );
    expect(loadDemoToken()).toBe('tok-123');
    clearDemoToken();
    expect(loadDemoToken()).toBeNull();
  });

  it('sends the bearer header and never the URL', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await demoFetch('/session', 'tok-abc');
    const calls = fetchMock.mock.calls as unknown as Array<
      [unknown, { headers?: Record<string, string> }]
    >;
    const [url, init] = calls[0];
    expect(String(url)).not.toContain('tok-abc');
    expect(init?.headers?.['Authorization']).toBe(demoAuthHeader('tok-abc'));
  });

  it('surfaces typed conflicts for stale revisions', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ code: 'stale_revision' }), { status: 409 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(demoFetch('/actions', 'tok-abc')).rejects.toMatchObject({
      code: 'stale_revision',
    });
  });
});
