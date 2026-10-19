/**
 * Functional spec: settings hydration must treat server metadata as
 * authoritative on EVERY load, and never let a stale persisted `initialized`
 * flag pin the environment forever (spec-02: persisted `initialized` blocked
 * all future hydrations).
 *
 * Policies locked here:
 * - isProduction + serverConfiguredProviders always follow the server;
 * - configured providers become enabled + serverConfigured with the server
 *   model; providers the server no longer configures lose serverConfigured
 *   (and their enablement, unless the user owns a local key);
 * - the local defaultProvider choice survives hydration;
 * - a locally-customized System AI survives hydration; the pristine one
 *   adopts the server default;
 * - legacy persisted payloads carrying `initialized` migrate cleanly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';

const hydrateFirst = () =>
    useSettingsStore.getState().initializeFromServer({
        isProduction: true,
        configuredProviders: ['openrouter'],
        defaultProvider: 'openrouter',
        defaultModels: { openrouter: 'anthropic/claude-sonnet-4' },
        systemAI: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4', temperature: 0.4, maxTokens: 1024 },
    });

const hydrateSecond = () =>
    useSettingsStore.getState().initializeFromServer({
        isProduction: false,
        configuredProviders: ['ollama'],
        defaultProvider: 'ollama',
        defaultModels: { ollama: 'llama3.2' },
        systemAI: { provider: 'ollama', model: 'llama3.2', temperature: 0.5, maxTokens: 2048 },
    });

describe('settings hydration (store)', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useSettingsStore.getState().resetAllSettings();
        useSettingsStore.getState().lockVault();
    });

    it('applies server metadata on every hydration, not just once', () => {
        hydrateFirst();

        const first = useSettingsStore.getState();
        expect(first.isProduction).toBe(true);
        expect(first.serverConfiguredProviders).toEqual(['openrouter']);
        expect(first.providers.openrouter.serverConfigured).toBe(true);
        expect(first.providers.openrouter.enabled).toBe(true);
        expect(first.providers.openrouter.model).toBe('anthropic/claude-sonnet-4');
        expect(first.defaultProvider).toBe('openrouter'); // none set locally yet
        expect(first.systemAI.temperature).toBe(0.4);

        // The server configuration changed; the stale local view must not pin it.
        hydrateSecond();

        const second = useSettingsStore.getState();
        expect(second.isProduction).toBe(false);
        expect(second.serverConfiguredProviders).toEqual(['ollama']);
        // openrouter lost its server configuration and its server-only enablement
        expect(second.providers.openrouter.serverConfigured).toBe(false);
        expect(second.providers.openrouter.enabled).toBe(false);
        // ollama is now the server-configured provider
        expect(second.providers.ollama.enabled).toBe(true);
        expect(second.providers.ollama.serverConfigured).toBe(true);
        expect(second.providers.ollama.model).toBe('llama3.2');
        // The local default choice survives the second hydration
        expect(second.defaultProvider).toBe('openrouter');
    });

    it('preserves locally-owned BYOK providers during reconciliation', async () => {
        const store = useSettingsStore.getState();
        expect(await store.unlockVault('correct vault phrase')).toBe(true);
        await store.setProviderConfig('ollama', {
            apiKey: 'local-ollama-key',
            enabled: true,
        });

        hydrateSecond(); // ollama IS configured by this server
        expect(useSettingsStore.getState().providers.ollama.enabled).toBe(true);

        // And when the server stops configuring ollama, the user's own key
        // keeps the provider enabled for BYOK use.
        hydrateFirst(); // configured: openrouter only
        expect(useSettingsStore.getState().providers.ollama.enabled).toBe(true);
        expect(useSettingsStore.getState().providers.ollama.serverConfigured).toBe(false);
    });

    it('keeps a customized System AI and adopts the server default of a pristine one', () => {
        // Pristine: adopt server metadata.
        hydrateFirst();
        expect(useSettingsStore.getState().systemAI.temperature).toBe(0.4);

        // Once the user customizes it, hydration must not clobber the choice.
        useSettingsStore.getState().setSystemAI({ temperature: 0.9 });
        hydrateSecond();
        expect(useSettingsStore.getState().systemAI.temperature).toBe(0.9);
        expect(useSettingsStore.getState().systemAI.provider).toBe('openrouter');
    });

    it('keeps the user-set default provider over the server default', () => {
        useSettingsStore.getState().setDefaultProvider('ollama');
        hydrateFirst();
        expect(useSettingsStore.getState().defaultProvider).toBe('ollama');
    });
});

describe('legacy persisted payload migration', () => {
    it('strips the stale initialized flag and preserves user preferences', async () => {
        // A payload written by the pre-migration store: version 0 with a
        // persisted `initialized` flag that used to block hydration forever.
        window.localStorage.setItem(
            'sabha-settings',
            JSON.stringify({
                state: {
                    providers: {
                        openrouter: {
                            enabled: true,
                            serverConfigured: true,
                            apiKey: '',
                            model: 'anthropic/claude-sonnet-4-20250514',
                            temperature: 0.7,
                            maxTokens: 2048,
                        },
                        gemini: {
                            enabled: false,
                            serverConfigured: false,
                            apiKey: '',
                            model: 'gemini-2.0-flash',
                            temperature: 0.7,
                            maxTokens: 2048,
                        },
                        ollama: {
                            enabled: true,
                            apiKey: '',
                            model: 'llama3.2',
                            temperature: 0.7,
                            maxTokens: 2048,
                            baseUrl: 'http://localhost:11434',
                        },
                    },
                    defaultProvider: 'ollama',
                    systemAI: { provider: 'ollama', model: 'llama3.2', temperature: 0.6, maxTokens: 1500 },
                    isProduction: true,
                    initialized: true,
                    vaultSalt: 'some-salt',
                    vaultCiphertexts: {},
                },
                version: 0,
            })
        );

        // Fresh module instance rebuilds (and rehydrates) from storage.
        vi.resetModules();
        const migrated = await import('@/stores/settings-store');
        const state = migrated.useSettingsStore.getState();

        expect(state.defaultProvider).toBe('ollama');
        expect(state.systemAI.temperature).toBe(0.6);
        expect((state as unknown as Record<string, unknown>).initialized).toBeUndefined();
        expect(state.isProduction).toBe(true); // carried through migration

        // The next persist write stores the new version, without the flag.
        migrated.useSettingsStore.getState().setDefaultProvider('gemini');
        const stored = JSON.parse(window.localStorage.getItem('sabha-settings') ?? '{}');
        expect(stored.version).toBe(1);
        expect(stored.state.initialized).toBeUndefined();
        expect(stored.state.defaultProvider).toBe('gemini');
    });
});
