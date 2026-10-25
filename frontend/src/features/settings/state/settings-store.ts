/**
 * Settings Store - Local provider preferences with encrypted BYOK vault.
 *
 * Server-owned metadata (environment, System AI) lives in the settings query,
 * never here. This store persists only browser preferences and sealed key
 * envelopes; the System AI policy was removed in v2.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    forgetInVault,
    lockVault as lockVaultMemory,
    observeVaultStorage,
    openVault,
    revealFromVault,
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

export interface ProviderConfig {
    enabled: boolean;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    baseUrl?: string; // For Ollama
    serverConfigured?: boolean; // True if key is configured on server
}

export interface SettingsState {
    providers: {
        openrouter: ProviderConfig;
        gemini: ProviderConfig;
        ollama: ProviderConfig;
    };
    defaultProvider: 'openrouter' | 'gemini' | 'ollama' | null;

    // Environment info (loaded from backend; always re-applied on hydration)
    isProduction: boolean;
    serverConfiguredProviders: string[];

    // BYOK vault state (vaultUnlocked intentionally NOT persisted)
    vaultUnlocked: boolean;
    vaultSalt: string | null;
    vaultCiphertexts: Record<string, string>;
    vaultError: string | null;

    // Actions
    setProviderConfig: (providerId: keyof SettingsState['providers'], config: Partial<ProviderConfig>) => Promise<void>;
    setDefaultProvider: (providerId: keyof SettingsState['providers'] | null) => void;
    getActiveProvider: () => { id: string; config: ProviderConfig } | null;
    clearProviderConfig: (providerId: keyof SettingsState['providers']) => void;
    resetAllSettings: () => void;
    unlockVault: (passphrase: string) => Promise<boolean>;
    lockVault: () => void;
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
    apiKey: '',
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
    defaultProvider: null as SettingsState['defaultProvider'],
    isProduction: false,
    serverConfiguredProviders: [] as string[],
    vaultUnlocked: false,
    vaultSalt: null as string | null,
    vaultCiphertexts: {} as Record<string, string>,
    vaultError: null as string | null,
};

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set, get) => ({
            ...initialState,

            setProviderConfig: async (providerId, config) => {
                const { apiKey, ...safeConfig } = config as Partial<ProviderConfig>;

                if (apiKey !== undefined) {
                    const key = apiKey.trim();
                    if (key) {
                        const sealed = await sealIntoVault(providerId, key);
                        if (!sealed) {
                            // Never write a secret (or its ciphertext) while locked.
                            set({ vaultError: 'Unlock the key vault before saving a provider key.' });
                            return;
                        }
                        set((state) => ({
                            vaultError: null,
                            vaultCiphertexts: {
                                ...state.vaultCiphertexts,
                                [providerId]: sealed,
                            },
                            providers: {
                                ...state.providers,
                                [providerId]: {
                                    ...state.providers[providerId],
                                    ...safeConfig,
                                    // The stored config never carries the plaintext.
                                    apiKey: '',
                                },
                            },
                        }));
                        return;
                    }

                    // Explicit clear: drop ciphertext + memory key too.
                    forgetInVault(providerId);
                    set((state) => {
                        const { [providerId]: _dropped, ...remaining } = state.vaultCiphertexts;
                        return {
                            vaultError: null,
                            vaultCiphertexts: remaining,
                            providers: {
                                ...state.providers,
                                [providerId]: {
                                    ...state.providers[providerId],
                                    ...safeConfig,
                                    apiKey: '',
                                },
                            },
                        };
                    });
                    return;
                }

                set((state) => ({
                    providers: {
                        ...state.providers,
                        [providerId]: {
                            ...state.providers[providerId],
                            ...safeConfig,
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
                    const { [providerId]: _dropped, ...remaining } = state.vaultCiphertexts;
                    return {
                        vaultCiphertexts: remaining,
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
                set({ ...initialState, vaultCiphertexts: {}, vaultSalt: null, vaultUnlocked: false, vaultError: null });
            },

            unlockVault: async (passphrase) => {
                // The vault proves the passphrase against existing ciphertext
                // before unlocking; a wrong passphrase leaves it locked.
                const result = await openVault(passphrase, get().vaultSalt, get().vaultCiphertexts);
                if (!result.ok) {
                    set({ vaultError: result.error });
                    return false;
                }

                set({ vaultUnlocked: true, vaultError: null, vaultSalt: result.salt });
                return true;
            },

            lockVault: () => {
                lockVaultMemory();
                set({ vaultUnlocked: false });
            },

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
                    updates.defaultProvider = data.defaultProvider as SettingsState['defaultProvider'];
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
            // Version 2: Server AI became server-owned, and legacy payloads
            // carried an `initialized` flag that gated hydration forever.
            // Both are stripped; user preferences and vault data survive.
            version: 2,
            migrate: (persisted) => {
                const legacy = persisted as Record<string, unknown> & Partial<SettingsState>;
                delete legacy.initialized;
                delete legacy.systemAI;
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
        useSettingsStore.setState({ vaultUnlocked: false });
    });
}
