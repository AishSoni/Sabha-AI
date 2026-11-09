/**
 * Decoders for the settings metadata wire (spec-05).
 *
 * The decoded views are the feature's own wire shapes: the provider cards
 * consume them directly, and the environment/system-AI projections are
 * camelCase views of server state.
 */
import {
    DecodeError,
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

export type SystemAISourceView = 'stored' | 'environment' | 'fallback';
export type SystemAIStateView = 'available' | 'missing' | 'failed';

export interface SystemAIStatusView {
    source: SystemAISourceView;
    state: SystemAIStateView;
    degraded: boolean;
    message: string;
}

export interface ProvidersEnvironment {
    providers: ProviderInfoView[];
    environment: EnvironmentInfoView;
    systemAI: SystemAIConfigView;
    systemAIStatus: SystemAIStatusView;
}

function requireLiteral<T extends string>(
    value: unknown,
    path: string,
    allowed: readonly T[],
): T {
    const text = requireString(value, path);
    if (!allowed.includes(text as T)) {
        throw new DecodeError(`${path}: expected one of ${allowed.join(', ')}`);
    }
    return text as T;
}

export function decodeSystemAIStatus(value: unknown, path: string): SystemAIStatusView {
    const record = decodeObject(value, path);
    return {
        source: requireLiteral(record.source, `${path}.source`, [
            'stored',
            'environment',
            'fallback',
        ] as const),
        state: requireLiteral(record.state, `${path}.state`, [
            'available',
            'missing',
            'failed',
        ] as const),
        degraded: requireBoolean(record.degraded, `${path}.degraded`),
        message: requireString(record.message, `${path}.message`),
    };
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
    const systemAIStatus = decodeObject(
        record.system_ai_status,
        `${path}.system_ai_status`,
    );

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
        systemAIStatus: decodeSystemAIStatus(
            systemAIStatus,
            `${path}.system_ai_status`,
        ),
    };
}

export type CapabilityStateView =
    | 'missing'
    | 'disabled'
    | 'unverified'
    | 'available'
    | 'failed'
    | 'unsupported';

export interface CapabilityDiagnosticView {
    state: CapabilityStateView;
    detail: string;
    effect: string;
    remediation: string;
}

export interface ProviderDiagnosticView extends CapabilityDiagnosticView {
    id: string;
    name: string;
    credentialRequired: boolean;
    serverCredentialConfigured: boolean;
}

export interface EmbeddingDiagnosticView extends CapabilityDiagnosticView {
    provider: string;
    model: string;
    dimension: number;
    credentialRequired: boolean;
    serverCredentialConfigured: boolean;
}

export interface KnowledgeDiagnosticView extends CapabilityDiagnosticView {
    qdrantConfigured: boolean;
    qdrantCredentialConfigured: boolean;
    bucketConfigured: boolean;
}

export interface ExecutionDiagnosticView extends CapabilityDiagnosticView {
    inProcessRunner: 'enabled' | 'disabled';
    externalWorker: 'unknown';
    livenessScope: string;
}

export interface SettingsDiagnosticsView {
    runtimeMode: string;
    appEnv: string;
    providers: ProviderDiagnosticView[];
    embedding: EmbeddingDiagnosticView;
    knowledge: KnowledgeDiagnosticView;
    execution: ExecutionDiagnosticView;
    systemAI: SystemAIStatusView;
}

function decodeCapabilityDiagnostic(
    value: unknown,
    path: string,
): CapabilityDiagnosticView {
    const record = decodeObject(value, path);
    return {
        state: requireLiteral(record.state, `${path}.state`, [
            'missing',
            'disabled',
            'unverified',
            'available',
            'failed',
            'unsupported',
        ] as const),
        detail: requireString(record.detail, `${path}.detail`),
        effect: requireString(record.effect, `${path}.effect`),
        remediation: requireString(record.remediation, `${path}.remediation`),
    };
}

function decodeProviderDiagnostic(
    value: unknown,
    path: string,
): ProviderDiagnosticView {
    const capability = decodeCapabilityDiagnostic(value, path);
    const record = decodeObject(value, path);
    return {
        ...capability,
        id: requireString(record.id, `${path}.id`),
        name: requireString(record.name, `${path}.name`),
        credentialRequired: requireBoolean(
            record.credential_required,
            `${path}.credential_required`,
        ),
        serverCredentialConfigured: requireBoolean(
            record.server_credential_configured,
            `${path}.server_credential_configured`,
        ),
    };
}

export function decodeSettingsDiagnostics(
    value: unknown,
    path: string,
): SettingsDiagnosticsView {
    const record = decodeObject(value, path);
    const embeddingRecord = decodeObject(record.embedding, `${path}.embedding`);
    const knowledgeRecord = decodeObject(record.knowledge, `${path}.knowledge`);
    const executionRecord = decodeObject(record.execution, `${path}.execution`);

    const embeddingCapability = decodeCapabilityDiagnostic(
        record.embedding,
        `${path}.embedding`,
    );
    const knowledgeCapability = decodeCapabilityDiagnostic(
        record.knowledge,
        `${path}.knowledge`,
    );
    const executionCapability = decodeCapabilityDiagnostic(
        record.execution,
        `${path}.execution`,
    );

    return {
        runtimeMode: requireString(record.runtime_mode, `${path}.runtime_mode`),
        appEnv: requireString(record.app_env, `${path}.app_env`),
        providers: requireArray(
            record.providers ?? [],
            `${path}.providers`,
            (item, itemPath) => decodeProviderDiagnostic(item, itemPath),
        ),
        embedding: {
            ...embeddingCapability,
            provider: requireString(
                embeddingRecord.provider,
                `${path}.embedding.provider`,
            ),
            model: requireString(embeddingRecord.model, `${path}.embedding.model`),
            dimension: requireNumber(
                embeddingRecord.dimension,
                `${path}.embedding.dimension`,
            ),
            credentialRequired: requireBoolean(
                embeddingRecord.credential_required,
                `${path}.embedding.credential_required`,
            ),
            serverCredentialConfigured: requireBoolean(
                embeddingRecord.server_credential_configured,
                `${path}.embedding.server_credential_configured`,
            ),
        },
        knowledge: {
            ...knowledgeCapability,
            qdrantConfigured: requireBoolean(
                knowledgeRecord.qdrant_configured,
                `${path}.knowledge.qdrant_configured`,
            ),
            qdrantCredentialConfigured: requireBoolean(
                knowledgeRecord.qdrant_credential_configured,
                `${path}.knowledge.qdrant_credential_configured`,
            ),
            bucketConfigured: requireBoolean(
                knowledgeRecord.bucket_configured,
                `${path}.knowledge.bucket_configured`,
            ),
        },
        execution: {
            ...executionCapability,
            inProcessRunner: requireLiteral(
                executionRecord.in_process_runner,
                `${path}.execution.in_process_runner`,
                ['enabled', 'disabled'] as const,
            ),
            externalWorker: requireLiteral(
                executionRecord.external_worker,
                `${path}.execution.external_worker`,
                ['unknown'] as const,
            ),
            livenessScope: requireString(
                executionRecord.liveness_scope,
                `${path}.execution.liveness_scope`,
            ),
        },
        systemAI: decodeSystemAIStatus(
            record.system_ai,
            `${path}.system_ai`,
        ),
    };
}
