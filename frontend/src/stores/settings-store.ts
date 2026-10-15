/**
 * Settings Store - Server-persisted non-secret preferences (D-09).
 * Browser storage never holds API keys: secrets stay server-managed and
 * inference settings come from the authoritative server session.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { settingsApi, type EffectiveSettings } from '@/lib/api';

export type SettingsSaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface ProviderConfig {
    enabled: boolean;
    model: string;
    temperature: number;
    maxTokens: number;
    serverConfigured?: boolean; // True if key is configured on server
}

export interface SystemAIConfig {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
}

export interface SettingsState {
    providers: {
        openrouter: ProviderConfig;
        gemini: ProviderConfig;
        ollama: ProviderConfig;
    };
    defaultProvider: 'openrouter' | 'gemini' | 'ollama' | null;
    systemAI: SystemAIConfig;

    // Environment info (loaded from backend)
    isProduction: boolean;
    serverConfiguredProviders: string[];
    initialized: boolean; // Whether settings have been initialized from backend

    // Server persistence status (never claims success before the server confirms)
    saveStatus: SettingsSaveStatus;
    saveError: string | null;

    // Effective settings actually used for inference (server-resolved)
    effective: EffectiveSettings | null;
    effectiveReadiness: { ready: boolean; reason: string } | null;

    // Actions
    setProviderConfig: (providerId: keyof SettingsState['providers'], config: Partial<ProviderConfig>) => void;
    setDefaultProvider: (providerId: keyof SettingsState['providers'] | null) => void;
    setSystemAI: (config: Partial<SystemAIConfig>) => void;
    getActiveProvider: () => { id: string; config: ProviderConfig } | null;
    clearProviderConfig: (providerId: keyof SettingsState['providers']) => void;
    resetAllSettings: () => void;
    persistToServer: () => Promise<boolean>;
    loadFromServer: () => Promise<boolean>;
    refreshEffective: () => Promise<boolean>;
    clearSaveStatus: () => void;
    initializeFromServer: (data: {
        isProduction: boolean;
        configuredProviders: string[];
        defaultProvider: string;
        defaultModels: Record<string, string>;
        systemAI: SystemAIConfig;
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
        ollama: { ...defaultProviderConfig, model: 'llama3.2', enabled: true },
    },
    defaultProvider: null as SettingsState['defaultProvider'],
    systemAI: {
        provider: '',
        model: '',
        temperature: 0.5,
        maxTokens: 2048,
    },
    isProduction: false,
    serverConfiguredProviders: [] as string[],
    initialized: false,
    saveStatus: 'idle' as SettingsSaveStatus,
    saveError: null as string | null,
    effective: null as EffectiveSettings | null,
    effectiveReadiness: null as { ready: boolean; reason: string } | null,
};

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set, get) => ({
            ...initialState,

            setProviderConfig: (providerId, config) => {
                set((state) => ({
                    providers: {
                        ...state.providers,
                        [providerId]: {
                            ...state.providers[providerId],
                            ...config,
                        },
                    },
                }));
                // Server owns persistence; browser never holds secrets.
                void get().persistToServer();
            },

            setDefaultProvider: (providerId) => {
                set({ defaultProvider: providerId });
                void get().persistToServer();
            },

            setSystemAI: (config) => {
                set((state) => ({
                    systemAI: { ...state.systemAI, ...config },
                }));
                void get().persistToServer();
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
                set((state) => ({
                    providers: {
                        ...state.providers,
                        [providerId]: {
                            ...defaultProviderConfig,
                            model: initialState.providers[providerId].model,
                        },
                    },
                    defaultProvider: state.defaultProvider === providerId ? null : state.defaultProvider,
                }));
                // Fire-and-forget server sync; secrets are never sent.
                void get().persistToServer();
            },

            resetAllSettings: () => {
                try {
                    // Drop any legacy browser-stored secrets from earlier schemas.
                    localStorage.removeItem('sabha-settings');
                } catch { /* storage unavailable in some contexts */ }
                set(initialState);
            },

            persistToServer: async () => {
                const state = get();
                const activeId = state.defaultProvider;
                const active = activeId
                    ? state.providers[activeId]
                    : state.getActiveProvider()?.config;
                set({ saveStatus: 'saving', saveError: null });
                try {
                    await settingsApi.savePreferences({
                        default_provider: state.defaultProvider ?? '',
                        default_model: active?.model ?? '',
                        default_temperature: active?.temperature ?? 0.7,
                        default_max_tokens: active?.maxTokens ?? 2048,
                        system_ai: {
                            provider: state.systemAI.provider,
                            model: state.systemAI.model,
                            temperature: state.systemAI.temperature,
                            max_tokens: state.systemAI.maxTokens,
                        },
                    });
                    set({ saveStatus: 'saved', saveError: null });
                    // Refresh the resolved effective values so the panel shows
                    // exactly what the server will use for inference.
                    await get().refreshEffective();
                    return true;
                } catch (err) {
                    set({
                        saveStatus: 'failed',
                        saveError: err instanceof Error ? err.message : 'Save failed',
                    });
                    return false;
                }
            },

            clearSaveStatus: () => set({ saveStatus: 'idle', saveError: null }),

            refreshEffective: async () => {
                try {
                    const data = await settingsApi.getEffective();
                    set({
                        effective: data.effective,
                        effectiveReadiness: data.readiness,
                    });
                    return true;
                } catch {
                    set({ effective: null, effectiveReadiness: null });
                    return false;
                }
            },

            loadFromServer: async () => {
                try {
                    const data = await settingsApi.getPreferences();
                    const prefs = data.preferences ?? {};
                    set((state) => {
                        const nextDefault = (prefs.default_provider as SettingsState['defaultProvider'])
                            ?? state.defaultProvider;
                        const providers = { ...state.providers };
                        if (nextDefault && providers[nextDefault]) {
                            providers[nextDefault] = {
                                ...providers[nextDefault],
                                model: prefs.default_model ?? providers[nextDefault].model,
                                temperature: prefs.default_temperature ?? providers[nextDefault].temperature,
                                maxTokens: prefs.default_max_tokens ?? providers[nextDefault].maxTokens,
                            };
                        }
                        return {
                            defaultProvider: nextDefault,
                            providers,
                            systemAI: {
                                provider: prefs.system_ai?.provider ?? state.systemAI.provider,
                                model: prefs.system_ai?.model ?? state.systemAI.model,
                                temperature: prefs.system_ai?.temperature ?? state.systemAI.temperature,
                                maxTokens: prefs.system_ai?.max_tokens ?? state.systemAI.maxTokens,
                            },
                            initialized: true,
                        };
                    });
                    await get().refreshEffective();
                    return true;
                } catch {
                    return false;
                }
            },

            initializeFromServer: (data) => {
                const state = get();

                // Only auto-populate if not already initialized (first load)
                if (state.initialized) return;

                const updates: Partial<SettingsState> = {
                    isProduction: data.isProduction,
                    serverConfiguredProviders: data.configuredProviders,
                    initialized: true,
                };

                // Set default provider from server if not set locally
                if (!state.defaultProvider && data.defaultProvider) {
                    updates.defaultProvider = data.defaultProvider as SettingsState['defaultProvider'];
                }

                // Update System AI from server
                updates.systemAI = {
                    ...state.systemAI,
                    ...data.systemAI,
                };

                // Auto-enable and set models for server-configured providers
                const newProviders = { ...state.providers };
                for (const providerId of data.configuredProviders) {
                    const key = providerId as keyof typeof newProviders;
                    if (newProviders[key]) {
                        newProviders[key] = {
                            ...newProviders[key],
                            enabled: true,
                            serverConfigured: true,
                            model: data.defaultModels[providerId] || newProviders[key].model,
                        };
                    }
                }
                updates.providers = newProviders;

                set(updates);
            },
        }),
        {
            name: 'sabha-settings',
            // Never persist secrets: only non-secret preferences survive.
            // Legacy apiKey/baseUrl entries are dropped on migrate.
            partialize: (state) => ({
                providers: {
                    openrouter: {
                        enabled: state.providers.openrouter.enabled,
                        model: state.providers.openrouter.model,
                        temperature: state.providers.openrouter.temperature,
                        maxTokens: state.providers.openrouter.maxTokens,
                        serverConfigured: state.providers.openrouter.serverConfigured,
                    },
                    gemini: {
                        enabled: state.providers.gemini.enabled,
                        model: state.providers.gemini.model,
                        temperature: state.providers.gemini.temperature,
                        maxTokens: state.providers.gemini.maxTokens,
                        serverConfigured: state.providers.gemini.serverConfigured,
                    },
                    ollama: {
                        enabled: state.providers.ollama.enabled,
                        model: state.providers.ollama.model,
                        temperature: state.providers.ollama.temperature,
                        maxTokens: state.providers.ollama.maxTokens,
                        serverConfigured: state.providers.ollama.serverConfigured,
                    },
                },
                defaultProvider: state.defaultProvider,
                systemAI: state.systemAI,
                initialized: state.initialized,
            }),
            migrate: (persisted: unknown) => {
                if (!persisted || typeof persisted !== 'object') return persisted as never;
                const state = persisted as Record<string, unknown>;
                const providers = state.providers as Record<string, Record<string, unknown>> | undefined;
                if (providers) {
                    for (const key of Object.keys(providers)) {
                        // Strip legacy secrets without sending them anywhere.
                        delete providers[key].apiKey;
                        delete providers[key].baseUrl;
                    }
                }
                return state as never;
            },
            version: 2,
        }
    )
);
