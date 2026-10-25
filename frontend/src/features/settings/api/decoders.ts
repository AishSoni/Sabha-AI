/**
 * Decoders for the settings metadata wire (spec-05).
 *
 * The decoded views are the feature's own wire shapes: the provider cards
 * consume them directly, and the environment/system-AI projections are
 * camelCase views of server state.
 */
import {
    decodeObject,
    optionalNumber,
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

export function decodeSystemAIConfig(value: unknown, path: string): SystemAIConfigView {
    const record = decodeObject(value, path);
    return {
        provider: requireString(record.provider, `${path}.provider`),
        model: requireString(record.model, `${path}.model`),
        temperature: requireNumber(record.temperature, `${path}.temperature`),
        maxTokens: requireNumber(record.max_tokens, `${path}.max_tokens`),
    };
}

/** One model discovered by proxying a provider's model directory. */
export interface FetchedModelInfoView {
    id: string;
    name: string;
    context_length?: number;
}

export interface FetchModelsResultView {
    success: boolean;
    models: FetchedModelInfoView[];
    message: string;
}

export interface TestProviderKeyResultView {
    valid: boolean;
    message: string;
    models?: string[];
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

export function decodeFetchedModel(value: unknown, path: string): FetchedModelInfoView {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        name: requireString(record.name, `${path}.name`),
        context_length: optionalNumber(record.context_length, `${path}.context_length`),
    };
}

export function decodeFetchModelsResult(value: unknown, path: string): FetchModelsResultView {
    const record = decodeObject(value, path);
    return {
        success: requireBoolean(record.success, `${path}.success`),
        models: requireArray(record.models ?? [], `${path}.models`, (item, itemPath) =>
            decodeFetchedModel(item, itemPath),
        ),
        message: requireString(record.message, `${path}.message`),
    };
}

export function decodeTestProviderKeyResult(
    value: unknown,
    path: string,
): TestProviderKeyResultView {
    const record = decodeObject(value, path);
    return {
        valid: requireBoolean(record.valid, `${path}.valid`),
        message: requireString(record.message, `${path}.message`),
        models:
            record.models === undefined
                ? undefined
                : requireArray(record.models, `${path}.models`, (item, itemPath) =>
                      requireString(item, itemPath),
                  ),
    };
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
        systemAI: decodeSystemAIConfig(systemAI, `${path}.system_ai`),
    };
}
