/**
 * Decoders for the settings metadata wire (spec-05).
 *
 * The decoded views are structurally identical to the legacy `ProviderInfo`
 * interfaces the provider cards consume, so the section can pass them
 * through unchanged while '@/lib/api' remains on the legacy path. Only the
 * environment and system-AI projections — the parts initializeFromServer
 * consumes — are decoded into camelCase server state.
 */
import {
    decodeObject,
    optionalString,
    requireArray,
    requireBoolean,
    requireNumber,
    requireString,
} from '@/shared/api/decode';

export interface ProviderModelInfoView {
    id: string;
    name: string;
    context_length: number;
    supports_tools: boolean;
    supports_streaming: boolean;
}

export interface ProviderInfoView {
    id: string;
    name: string;
    description: string;
    requires_api_key: boolean;
    base_url?: string;
    models: ProviderModelInfoView[];
    default_model: string;
    default_temperature: number;
    default_max_tokens: number;
}

export interface EnvironmentInfoView {
    isProduction: boolean;
    configuredProviders: string[];
    defaultProvider: string;
    defaultModels: Record<string, string>;
}

export interface SystemAIConfigView {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
}

export interface ProvidersEnvironment {
    providers: ProviderInfoView[];
    environment: EnvironmentInfoView;
    systemAI: SystemAIConfigView;
}

export function decodeProviderModel(value: unknown, path: string): ProviderModelInfoView {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        name: requireString(record.name, `${path}.name`),
        context_length: requireNumber(record.context_length, `${path}.context_length`),
        supports_tools: requireBoolean(record.supports_tools, `${path}.supports_tools`),
        supports_streaming: requireBoolean(record.supports_streaming, `${path}.supports_streaming`),
    };
}

export function decodeProviderInfo(value: unknown, path: string): ProviderInfoView {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        name: requireString(record.name, `${path}.name`),
        description: requireString(record.description, `${path}.description`),
        requires_api_key: requireBoolean(record.requires_api_key, `${path}.requires_api_key`),
        base_url: optionalString(record.base_url, `${path}.base_url`),
        models: requireArray(record.models ?? [], `${path}.models`, (item, itemPath) =>
            decodeProviderModel(item, itemPath),
        ),
        default_model: requireString(record.default_model, `${path}.default_model`),
        default_temperature: requireNumber(record.default_temperature, `${path}.default_temperature`),
        default_max_tokens: requireNumber(record.default_max_tokens, `${path}.default_max_tokens`),
    };
}

export function decodeDefaultModels(value: unknown, path: string): Record<string, string> {
    const record = decodeObject(value, path);
    const models: Record<string, string> = {};
    for (const [key, entry] of Object.entries(record)) {
        models[key] = requireString(entry, `${path}.${key}`);
    }
    return models;
}

export function decodeProvidersEnvironment(value: unknown, path: string): ProvidersEnvironment {
    const record = decodeObject(value, path);
    const environment = decodeObject(record.environment, `${path}.environment`);
    const systemAI = decodeObject(record.system_ai, `${path}.system_ai`);

    return {
        providers: requireArray(
            record.providers ?? [],
            `${path}.providers`,
            (item, itemPath) => decodeProviderInfo(item, itemPath),
        ),
        environment: {
            isProduction: requireBoolean(environment.is_production, `${path}.environment.is_production`),
            configuredProviders: requireArray(
                environment.configured_providers ?? [],
                `${path}.environment.configured_providers`,
                (item, itemPath) => requireString(item, itemPath),
            ),
            defaultProvider: requireString(environment.default_provider, `${path}.environment.default_provider`),
            defaultModels: decodeDefaultModels(environment.default_models ?? {}, `${path}.environment.default_models`),
        },
        systemAI: {
            provider: requireString(systemAI.provider, `${path}.system_ai.provider`),
            model: requireString(systemAI.model, `${path}.system_ai.model`),
            temperature: requireNumber(systemAI.temperature, `${path}.system_ai.temperature`),
            maxTokens: requireNumber(systemAI.max_tokens, `${path}.system_ai.max_tokens`),
        },
    };
}
