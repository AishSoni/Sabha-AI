/**
 * Settings Store - Local provider preferences with encrypted BYOK vault.
 *
 * Server-owned metadata (environment, System AI) lives in the settings query,
 * never here. This store persists only browser preferences and sealed key
 * envelopes; the System AI policy was removed in v2.
 *
 * Provider keys are never part of ProviderConfig: the card owns a transient
 * draft, while stored presence is the sealed ciphertext map. That distinction
 * is what lets a blank input mean "no draft" instead of "no stored key".
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    forgetInVault,
    lockVault as lockVaultMemory,
    observeVaultStorage,
    openVault,
    revealFromVault,
    rekeyVault,
    sealIntoVault,
} from '@/shared/credentials/vault';

/** Browser-composed generation settings; the key is memory-only. */
export interface GenerationSettings {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    baseUrl?: string;
    apiKey?: string;
}

// The key vault lives in src/shared/credentials: this store only orchestrates
// it and persists sealed envelopes (ciphertext + salt, never any plaintext).
const SETTINGS_STORAGE_KEY = 'sabha-settings';

export type ProviderId = 'openrouter' | 'gemini' | 'ollama';

export interface ProviderConfig {
    enabled: boolean;
    model: string;
    temperature: number;
    maxTokens: number;
    baseUrl?: string; // For Ollama
    serverConfigured?: boolean; // True if key is configured on server
}

export interface ProviderKeySaveResult {
    ok: boolean;
    error?: string;
}

export interface SettingsState {
    providers: {
        openrouter: ProviderConfig;
        gemini: ProviderConfig;
        ollama: ProviderConfig;
    };
    defaultProvider: ProviderId | null;

    // Environment info (loaded from backend; always re-applied on hydration)
    isProduction: boolean;
    serverConfiguredProviders: string[];

    // BYOK vault state (vaultUnlocked intentionally NOT persisted)
    vaultUnlocked: boolean;
    vaultSalt: string | null;
    vaultCiphertexts: Record<string, string>;
    vaultError: string | null;
    // Increments whenever unlocked material appears or disappears. Async
    // callers capture it before a request and discard late results if it moved.
    vaultEpoch: number;

    // Actions
    setProviderConfig: (providerId: ProviderId, config: Partial<ProviderConfig>) => void;
    setDefaultProvider: (providerId: ProviderId | null) => void;
    getActiveProvider: () => { id: string; config: ProviderConfig } | null;
    clearProviderConfig: (providerId: ProviderId) => void;
    resetAllSettings: () => void;
    createVault: (passphrase: string) => Promise<boolean>;
    unlockVault: (passphrase: string) => Promise<boolean>;
    lockVault: () => void;
    changeVaultPassphrase: (passphrase: string) => Promise<boolean>;
    saveProviderKey: (providerId: ProviderId, plaintext: string) => Promise<ProviderKeySaveResult>;
    removeProviderKey: (providerId: ProviderId) => void;
    hasStoredKey: (providerId: ProviderId) => boolean;
    composeGenerationSettings: () => GenerationSettings | null;
    getProviderApiKey: (providerId: string) => string | undefined;
    initializeFromServer: (data: {
        isProduction: boolean;
        configuredProviders: string[];
        defaultProvider: string;
        defaultModels: Record<string, string>;
    }) => void;
}

const defaultProviderConfig: ProviderConfig = {
    enabled: false,
    model: '',
    temperature: 0.7,
    maxTokens: 2048,
    serverConfigured: false,
};

const initialState = {
    providers: {
        openrouter: { ...defaultProviderConfig, model: 'anthropic/claude-sonnet-4-20250514' },
        gemini: { ...defaultProviderConfig, model: 'gemini-2.0-flash' },
        ollama: { ...defaultProviderConfig, model: 'llama3.2', baseUrl: 'http://localhost:11434', enabled: true },
    },
    defaultProvider: null as ProviderId | null,
    isProduction: false,
    serverConfiguredProviders: [] as string[],
    vaultUnlocked: false,
    vaultSalt: null as string | null,
    vaultCiphertexts: {} as Record<string, string>,
    vaultError: null as string | null,
    vaultEpoch: 0,
};

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set, get) => ({
            ...initialState,

            setProviderConfig: (providerId, config) => {
                // Non-secret edits always apply, even while the vault is
                // locked. Keys go through saveProviderKey/removeProviderKey.
                set((state) => ({
                    providers: {
                        ...state.providers,
                        [providerId]: {
                            ...state.providers[providerId],
                            ...config,
                        },
                    },
                }));
            },

            setDefaultProvider: (providerId) => {
                set({ defaultProvider: providerId });
            },

            getActiveProvider: () => {
                const state = get();
                if (state.defaultProvider && state.providers[state.defaultProvider].enabled) {
                    return {
                        id: state.defaultProvider,
                        config: state.providers[state.defaultProvider],
                    };
                }

                // Find first enabled provider
                for (const [id, config] of Object.entries(state.providers)) {
                    if (config.enabled) {
                        return { id, config };
                    }
                }

                return null;
            },

            clearProviderConfig: (providerId) => {
                forgetInVault(providerId);
                set((state) => {
                    const remaining = { ...state.vaultCiphertexts };
                    delete remaining[providerId];
                    return {
                        vaultCiphertexts: remaining,
                        vaultEpoch: state.vaultEpoch + 1,
                        providers: {
                            ...state.providers,
                            [providerId]: {
                                ...defaultProviderConfig,
                                model: initialState.providers[providerId].model,
                                baseUrl: initialState.providers[providerId].baseUrl,
                            },
                        },
                        defaultProvider: state.defaultProvider === providerId ? null : state.defaultProvider,
                    };
                });
            },

            resetAllSettings: () => {
                lockVaultMemory();
                set((state) => ({
                    ...initialState,
                    vaultCiphertexts: {},
                    vaultSalt: null,
                    vaultUnlocked: false,
                    vaultError: null,
                    vaultEpoch: state.vaultEpoch + 1,
                }));
            },

            createVault: async (passphrase) => {
                if (get().vaultSalt !== null || Object.keys(get().vaultCiphertexts).length > 0) {
                    set({ vaultError: 'A key vault already exists. Unlock it instead.' });
                    return false;
                }

                set((state) => ({ vaultEpoch: state.vaultEpoch + 1, vaultError: null }));
                const attemptEpoch = get().vaultEpoch;
                const result = await openVault(passphrase, null, {});
                if (get().vaultEpoch !== attemptEpoch) {
                    return false;
                }
                if (!result.ok) {
                    set((state) => ({
                        vaultError: result.error,
                        vaultEpoch: state.vaultEpoch + 1,
                    }));
                    return false;
                }

                set((state) => ({
                    vaultUnlocked: true,
                    vaultSalt: result.salt,
                    vaultError: null,
                    vaultEpoch: state.vaultEpoch + 1,
                }));
                return true;
            },

            unlockVault: async (passphrase) => {
                // The vault proves the passphrase against existing ciphertext
                // before unlocking; a wrong passphrase leaves it locked.
                set((state) => ({ vaultEpoch: state.vaultEpoch + 1, vaultError: null }));
                const attemptEpoch = get().vaultEpoch;
                const result = await openVault(passphrase, get().vaultSalt, get().vaultCiphertexts);
                if (get().vaultEpoch !== attemptEpoch) {
                    return false;
                }
                if (!result.ok) {
                    set((state) => ({
                        vaultError: result.error,
                        vaultEpoch: state.vaultEpoch + 1,
                    }));
                    return false;
                }

                set((state) => ({
                    vaultUnlocked: true,
                    vaultError: null,
                    vaultSalt: result.salt,
                    vaultEpoch: state.vaultEpoch + 1,
                }));
                return true;
            },

            lockVault: () => {
                lockVaultMemory();
                set((state) => ({
                    vaultUnlocked: false,
                    vaultError: null,
                    vaultEpoch: state.vaultEpoch + 1,
                }));
            },

            changeVaultPassphrase: async (passphrase) => {
                if (!get().vaultUnlocked) {
                    set({ vaultError: 'Unlock the key vault before changing its passphrase.' });
                    return false;
                }

                const attemptEpoch = get().vaultEpoch;
                const sealed = await rekeyVault(passphrase);
                if (!sealed || get().vaultEpoch !== attemptEpoch) {
                    set({ vaultError: 'The key vault could not be re-encrypted in this browser.' });
                    return false;
                }

                set((state) => ({
                    vaultCiphertexts: sealed.sealed,
                    vaultSalt: sealed.salt,
                    vaultError: null,
                    vaultEpoch: state.vaultEpoch + 1,
                }));
                return true;
            },

            saveProviderKey: async (providerId, plaintext) => {
                const key = plaintext.trim();
                if (!key) {
                    return { ok: false, error: 'Enter an API key before saving.' };
                }

                const attemptEpoch = get().vaultEpoch;
                const sealed = await sealIntoVault(providerId, key);
                if (!sealed) {
                    const error = 'Unlock or create the key vault before saving a provider key.';
                    set({ vaultError: error });
                    return { ok: false, error };
                }
                if (get().vaultEpoch !== attemptEpoch) {
                    return {
                        ok: false,
                        error: 'The key vault changed before the key was saved. Try again.',
                    };
                }

                set((state) => ({
                    vaultError: null,
                    vaultEpoch: state.vaultEpoch + 1,
                    vaultCiphertexts: {
                        ...state.vaultCiphertexts,
                        [providerId]: sealed,
                    },
                }));
                return { ok: true };
            },

            removeProviderKey: (providerId) => {
                forgetInVault(providerId);
                set((state) => {
                    const remaining = { ...state.vaultCiphertexts };
                    delete remaining[providerId];
                    return {
                        vaultError: null,
                        vaultEpoch: state.vaultEpoch + 1,
                        vaultCiphertexts: remaining,
                    };
                });
            },

            hasStoredKey: (providerId) => get().vaultCiphertexts[providerId] !== undefined,

            composeGenerationSettings: () => {
                const active = get().getActiveProvider();
                if (!active) return null;
                const { id, config } = active;
                return {
                    provider: id,
                    model: config.model || undefined,
                    temperature: config.temperature,
                    maxTokens: config.maxTokens,
                    baseUrl: config.baseUrl || undefined,
                    // Key exists in memory only while the vault is unlocked.
                    apiKey: revealFromVault(id),
                };
            },

            getProviderApiKey: (providerId) => revealFromVault(providerId),

            initializeFromServer: (data) => {
                const state = get();

                // Server metadata is authoritative on EVERY hydration: a
                // persisted view must never pin the environment or the
                // provider roster of a deployment (the old behavior applied
                // this only once, gated by `initialized`).
                const updates: Partial<SettingsState> = {
                    isProduction: data.isProduction,
                    serverConfiguredProviders: [...data.configuredProviders],
                };

                // User choice wins: the server default applies only while
                // none is set locally.
                if (!state.defaultProvider && data.defaultProvider) {
                    updates.defaultProvider = data.defaultProvider as ProviderId;
                }

                // Auto-enable and set models for server-configured providers;
                // reconcile providers the server no longer configures.
                const configured = new Set(data.configuredProviders);
                const newProviders = { ...state.providers };
                for (const key of Object.keys(newProviders) as Array<keyof typeof newProviders>) {
                    const current = newProviders[key];
                    if (configured.has(key)) {
                        newProviders[key] = {
                            ...current,
                            enabled: true,
                            serverConfigured: true,
                            model: data.defaultModels[key] || current.model,
                        };
                        continue;
                    }

                    // Not configured anymore: clear the flag. A provider whose
                    // enablement came only from the server key (no user-owned
                    // ciphertext) is re-disabled; BYOK providers keep theirs.
                    const localKey = state.vaultCiphertexts[key] !== undefined;
                    newProviders[key] = {
                        ...current,
                        serverConfigured: false,
                        enabled: current.serverConfigured === true && !localKey ? false : current.enabled,
                    };
                }
                updates.providers = newProviders;

                set(updates);
            },
        }),
        {
            name: SETTINGS_STORAGE_KEY,
            // Version 3: provider configs no longer carry an apiKey field at
            // all. Stored keys are represented solely by vault ciphertexts.
            version: 3,
            migrate: (persisted) => {
                const legacy = persisted as Record<string, unknown> & Partial<SettingsState>;
                delete legacy.initialized;
                delete legacy.systemAI;

                const providers = legacy.providers as
                    | Record<string, Record<string, unknown>>
                    | undefined;
                if (providers && typeof providers === 'object') {
                    for (const config of Object.values(providers)) {
                        if (config && typeof config === 'object') {
                            delete config.apiKey;
                        }
                    }
                }

                return legacy as SettingsState;
            },
            partialize: (state) => ({
                providers: state.providers,
                defaultProvider: state.defaultProvider,
                // Vault: ciphertext + salt only; never the passphrase, the
                // derived key, or the unlocked flag.
                vaultSalt: state.vaultSalt,
                vaultCiphertexts: state.vaultCiphertexts,
            }),
        }
    )
);

// Cross-tab invalidation: when another tab rewrites the persisted payload,
// this tab's in-memory plaintexts may be stale — lock the vault in response.
if (typeof window !== 'undefined') {
    observeVaultStorage(window, SETTINGS_STORAGE_KEY, () => {
        lockVaultMemory();
        useSettingsStore.setState((state) => ({
            vaultUnlocked: false,
            vaultEpoch: state.vaultEpoch + 1,
            vaultError: 'The key vault changed in another tab. Unlock it again to continue.',
        }));
    });
}
