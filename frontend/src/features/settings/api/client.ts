/**
 * No-sign-in client for settings metadata reads (spec-05).
 *
 * This is a pure server-metadata read: no credential headers are ever
 * attached, and failures surface as plain {@link ApiError}s.
 */
import { requestJson } from '@/shared/api/transport';
import {
    decodeFetchModelsResult,
    decodeProvidersEnvironment,
    decodeSystemAIConfig,
    decodeTestProviderKeyResult,
    type FetchModelsResultView,
    type ProvidersEnvironment,
    type SystemAIConfigView,
    type TestProviderKeyResultView,
} from './decoders';

interface RequestInitOptional {
    signal?: AbortSignal;
}

export interface FetchProviderModelsInput {
    provider: string;
    /** BYOK key; transmitted only for this explicit user-triggered request. */
    apiKey?: string;
    baseUrl?: string;
}

export interface TestProviderKeyInput {
    provider: string;
    apiKey?: string;
    baseUrl?: string;
}

/** Server-owned app-level generation defaults; never contains a key. */
export interface UpdateSystemAIInput {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
}

export const settingsClient = {
    getProviders(init: RequestInitOptional = {}): Promise<ProvidersEnvironment> {
        return requestJson<unknown>('/settings/providers', { signal: init.signal }).then((payload) =>
            decodeProvidersEnvironment(payload, 'providers'),
        );
    },

    /**
     * Discover models through the backend's provider proxy. Not a query:
     * the request may carry a decrypted BYOK key, so it must never enter a
     * shared cache and only runs on explicit user intent.
     */
    fetchModels(
        input: FetchProviderModelsInput,
        init: RequestInitOptional = {},
    ): Promise<FetchModelsResultView> {
        return requestJson<unknown>('/settings/models', {
            method: 'POST',
            signal: init.signal,
            body: {
                provider: input.provider,
                api_key: input.apiKey || undefined,
                base_url: input.baseUrl || undefined,
            },
        }).then((payload) => decodeFetchModelsResult(payload, 'POST /settings/models'));
    },

    /** Test a provider credential. Same no-cache, explicit-intent rule. */
    testKey(
        input: TestProviderKeyInput,
        init: RequestInitOptional = {},
    ): Promise<TestProviderKeyResultView> {
        return requestJson<unknown>('/settings/test-key', {
            method: 'POST',
            signal: init.signal,
            body: {
                provider: input.provider,
                api_key: input.apiKey || undefined,
                base_url: input.baseUrl || undefined,
            },
        }).then((payload) => decodeTestProviderKeyResult(payload, 'POST /settings/test-key'));
    },

    /** Replace the validated, server-owned System AI policy. */
    updateSystemAI(
        input: UpdateSystemAIInput,
        init: RequestInitOptional = {},
    ): Promise<SystemAIConfigView> {
        return requestJson<unknown>('/settings/system-ai', {
            method: 'PUT',
            signal: init.signal,
            body: {
                provider: input.provider,
                model: input.model,
                temperature: input.temperature,
                max_tokens: input.maxTokens,
            },
        }).then((payload) => decodeSystemAIConfig(payload, 'PUT /settings/system-ai'));
    },
};
