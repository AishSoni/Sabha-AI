// Server-authoritative settings: the panel must show saving/saved/failed
// status and the exact effective values the server resolved — a rejected save
// must never look effective, and no secret may leave the browser.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { settingsApi as SettingsApi } from '@/lib/api';
import type { useSettingsStore as SettingsStoreHook } from '@/stores/settings-store';

vi.mock('@/lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...orig,
    settingsApi: {
      getProviders: vi.fn(),
      testKey: vi.fn(),
      fetchModels: vi.fn(),
      getPreferences: vi.fn(),
      savePreferences: vi.fn(),
      getEffective: vi.fn(),
    },
  };
});

let settingsApiMock: typeof SettingsApi;
let useSettingsStore: SettingsStoreHook;

function serverEffective() {
  return {
    success: true,
    effective: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.5,
      max_tokens: 2048,
      provenance: { provider: 'server-default' },
    },
    readiness: { ready: true, reason: 'server key configured' },
  };
}

beforeEach(async () => {
  vi.resetModules();
  // The persist layer captures storage at module-evaluation time, so the
  // stand-in must exist before the store module is (re-)imported.
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, v);
    },
    removeItem: (k: string) => {
      backing.delete(k);
    },
    clear: () => backing.clear(),
  });
  const apiMod = await import('@/lib/api');
  settingsApiMock = apiMod.settingsApi;
  ({ useSettingsStore } = await import('@/stores/settings-store'));
  useSettingsStore.setState({
    saveStatus: 'idle',
    saveError: null,
    effective: null,
    effectiveReadiness: null,
    initialized: false,
  });
});

describe('server-authoritative settings persistence', () => {
  it('reports saved and shows the exact server-resolved effective values', async () => {
    vi.mocked(settingsApiMock.savePreferences).mockResolvedValue({
      success: true,
      preferences: {},
    } as never);
    vi.mocked(settingsApiMock.getEffective).mockResolvedValue(serverEffective() as never);

    const ok = await useSettingsStore.getState().persistToServer();

    expect(ok).toBe(true);
    expect(useSettingsStore.getState().saveStatus).toBe('saved');
    const sent = vi.mocked(settingsApiMock.savePreferences).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(sent)).not.toMatch(/apiKey|baseUrl/);
    expect(useSettingsStore.getState().effective).toEqual(serverEffective().effective);
    expect(useSettingsStore.getState().effectiveReadiness).toEqual(
      serverEffective().readiness,
    );
  });

  it('a rejected save reports failed and never looks effective', async () => {
    vi.mocked(settingsApiMock.savePreferences).mockRejectedValue(
      new Error('reshaping rejected: 422'),
    );
    vi.mocked(settingsApiMock.getEffective).mockResolvedValue(serverEffective() as never);

    const ok = await useSettingsStore.getState().persistToServer();

    expect(ok).toBe(false);
    expect(useSettingsStore.getState().saveStatus).toBe('failed');
    expect(useSettingsStore.getState().saveError).toMatch(/422/);
    // The panel must not display stale effective values as current.
    expect(settingsApiMock.getEffective).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().effective).toBeNull();
  });

  it('an effective refresh failure clears stale effective values', async () => {
    vi.mocked(settingsApiMock.savePreferences).mockResolvedValue({
      success: true,
      preferences: {},
    } as never);
    vi.mocked(settingsApiMock.getEffective).mockResolvedValueOnce(
      serverEffective() as never,
    );
    await useSettingsStore.getState().persistToServer();
    expect(useSettingsStore.getState().effective).not.toBeNull();

    vi.mocked(settingsApiMock.getEffective).mockRejectedValueOnce(new Error('offline'));
    const ok = await useSettingsStore.getState().refreshEffective();

    expect(ok).toBe(false);
    expect(useSettingsStore.getState().effective).toBeNull();
    expect(useSettingsStore.getState().effectiveReadiness).toBeNull();
  });

  it('loading server preferences hydrates the same effective config', async () => {
    vi.mocked(settingsApiMock.getPreferences).mockResolvedValue({
      success: true,
      preferences: {
        default_provider: 'gemini',
        default_model: 'gemini-2.0-flash',
        default_temperature: 0.5,
        default_max_tokens: 1024,
        system_ai: {
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          temperature: 0.3,
          max_tokens: 1024,
        },
      },
    } as never);
    vi.mocked(settingsApiMock.getEffective).mockResolvedValue(serverEffective() as never);

    const ok = await useSettingsStore.getState().loadFromServer();

    expect(ok).toBe(true);
    const state = useSettingsStore.getState();
    expect(state.defaultProvider).toBe('gemini');
    expect(state.systemAI.temperature).toBe(0.3);
    expect(state.effective?.model).toBe('gemini-2.0-flash');
  });
});
