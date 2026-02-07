/**
 * Settings Store - Manages provider configurations with localStorage persistence
 * Supports environment-aware settings and System AI configuration.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProviderConfig {
    enabled: boolean;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    baseUrl?: string; // For Ollama
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

    // Actions
    setProviderConfig: (providerId: keyof SettingsState['providers'], config: Partial<ProviderConfig>) => void;
    setDefaultProvider: (providerId: keyof SettingsState['providers'] | null) => void;
    setSystemAI: (config: Partial<SystemAIConfig>) => void;
    getActiveProvider: () => { id: string; config: ProviderConfig } | null;
    clearProviderConfig: (providerId: keyof SettingsState['providers']) => void;
    resetAllSettings: () => void;
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
    systemAI: {
        provider: '',
        model: '',
        temperature: 0.5,
        maxTokens: 2048,
    },
    isProduction: false,
    serverConfiguredProviders: [] as string[],
    initialized: false,
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
            },

            setDefaultProvider: (providerId) => {
                set({ defaultProvider: providerId });
            },

            setSystemAI: (config) => {
                set((state) => ({
                    systemAI: { ...state.systemAI, ...config },
                }));
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
                            baseUrl: initialState.providers[providerId].baseUrl,
                        },
                    },
                    defaultProvider: state.defaultProvider === providerId ? null : state.defaultProvider,
                }));
            },

            resetAllSettings: () => {
                set(initialState);
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
            partialize: (state) => ({
                providers: state.providers,
                defaultProvider: state.defaultProvider,
                systemAI: state.systemAI,
                initialized: state.initialized,
            }),
        }
    )
);
