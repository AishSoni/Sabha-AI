/**
 * Settings Store - Manages provider configurations with localStorage persistence
 * Supports environment-aware settings and System AI configuration.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GenerationSettings } from '@/lib/api';

// ============== BYOK key vault (browser-only) ==============
// Provider keys are encrypted with an AES key derived from a user passphrase
// (PBKDF2 -> AES-GCM with a random salt and per-secret IV). Only ciphertext
// and the salt may reach localStorage; the derived key and plaintext keys
// live solely in module memory and vanish on lock or page refresh.
const PBKDF2_ITERATIONS = 210_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesToBase64 = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...Array.from(bytes)));

const base64ToBytes = (b64: string): Uint8Array =>
    Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));

async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase) as unknown as BufferSource,
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function encryptSecret(key: CryptoKey, plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as unknown as BufferSource },
            key,
            encoder.encode(plaintext) as unknown as BufferSource
        )
    );
    const packed = new Uint8Array(iv.length + encrypted.length);
    packed.set(iv, 0);
    packed.set(encrypted, iv.length);
    return bytesToBase64(packed);
}

async function decryptSecret(key: CryptoKey, payload: string): Promise<string> {
    const packed = base64ToBytes(payload);
    const iv = packed.slice(0, 12);
    const encrypted = packed.slice(12);
    return decoder.decode(
        await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as unknown as BufferSource },
            key,
            encrypted as unknown as BufferSource
        )
    );
}

const inMemoryKeys = new Map<string, string>();
let vaultKey: CryptoKey | null = null;

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
    setSystemAI: (config: Partial<SystemAIConfig>) => void;
    getActiveProvider: () => { id: string; config: ProviderConfig } | null;
    clearProviderConfig: (providerId: keyof SettingsState['providers']) => void;
    resetAllSettings: () => void;
    unlockVault: (passphrase: string) => Promise<boolean>;
    lockVault: () => void;
    composeGenerationSettings: () => GenerationSettings | null;
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
                        if (!vaultKey) {
                            // Never write a secret (or its ciphertext) while locked.
                            set({ vaultError: 'Unlock the key vault before saving a provider key.' });
                            return;
                        }
                        const ciphertext = await encryptSecret(vaultKey, key);
                        inMemoryKeys.set(providerId, key);
                        set((state) => ({
                            vaultError: null,
                            vaultCiphertexts: {
                                ...state.vaultCiphertexts,
                                [providerId]: ciphertext,
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
                    inMemoryKeys.delete(providerId);
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
                inMemoryKeys.delete(providerId);
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
                vaultKey = null;
                inMemoryKeys.clear();
                set({ ...initialState, vaultCiphertexts: {}, vaultSalt: null, vaultUnlocked: false, vaultError: null });
            },

            unlockVault: async (passphrase) => {
                // Salt: reuse the persisted one, or create it on first unlock.
                const existingSalt = get().vaultSalt;
                const saltBytes = existingSalt
                    ? base64ToBytes(existingSalt)
                    : crypto.getRandomValues(new Uint8Array(16));
                if (!existingSalt) {
                    set({ vaultSalt: bytesToBase64(saltBytes) });
                }

                const key = await deriveVaultKey(passphrase, saltBytes);

                // Prove the passphrase against existing ciphertext before
                // unlocking; a wrong passphrase leaves the vault locked.
                const ciphertexts = get().vaultCiphertexts;
                if (Object.keys(ciphertexts).length > 0) {
                    try {
                        for (const [providerId, payload] of Object.entries(ciphertexts)) {
                            inMemoryKeys.set(providerId, await decryptSecret(key, payload));
                        }
                    } catch {
                        inMemoryKeys.clear();
                        set({ vaultError: 'Incorrect passphrase — the vault stays locked.' });
                        return false;
                    }
                }

                vaultKey = key;
                set({ vaultUnlocked: true, vaultError: null });
                return true;
            },

            lockVault: () => {
                vaultKey = null;
                inMemoryKeys.clear();
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
                    apiKey: inMemoryKeys.get(id),
                };
            },

            initializeFromServer: (data) => {
                const state = get();
                const pristine = initialState.systemAI;

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

                // System AI is a local preference once customized; a pristine
                // (untouched) one adopts the server default.
                if (
                    state.systemAI.provider === pristine.provider
                    && state.systemAI.model === pristine.model
                    && state.systemAI.temperature === pristine.temperature
                    && state.systemAI.maxTokens === pristine.maxTokens
                ) {
                    updates.systemAI = {
                        ...state.systemAI,
                        ...data.systemAI,
                    };
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
            name: 'sabha-settings',
            // Version 1: legacy payloads carried an `initialized` flag which
            // gated hydration forever; it is no longer stored at all.
            version: 1,
            migrate: (persisted) => {
                // Prefers 1 (current): strip the stale flag, keep everything
                // else so user preferences and vault ciphertexts survive.
                const legacy = persisted as Record<string, unknown> & Partial<SettingsState>;
                delete legacy.initialized;
                return legacy as Partial<SettingsState>;
            },
            partialize: (state) => ({
                providers: state.providers,
                defaultProvider: state.defaultProvider,
                systemAI: state.systemAI,
                // Vault: ciphertext + salt only; never the passphrase, the
                // derived key, or the unlocked flag.
                vaultSalt: state.vaultSalt,
                vaultCiphertexts: state.vaultCiphertexts,
            }),
        }
    )
);
