/**
 * One effective generation configuration for a participant turn (spec-37).
 *
 * The backend resolves request > participant policy > legacy snapshot >
 * server defaults. The browser must send an override only when it intends
 * to override: a participant that explicitly selects provider B must not be
 * replaced by the unrelated browser-global provider A, and B's key must be
 * the one looked up for that turn and its cooldown.
 */
import type { TurnGenerationSettings } from '../api/generation-settings';
import type { AIParticipant } from '../api/decoders';

export type EffectiveGenerationSource = 'participant' | 'global' | 'server';

export interface BrowserGenerationConfig {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    baseUrl?: string;
}

export interface EffectiveGeneration {
    /** Request overrides to send; absent when the request should stand empty. */
    settings?: TurnGenerationSettings;
    /** Provider whose cooldown applies (and whose key may be attached). */
    provider: string;
    /** Provider known well enough to select a browser credential. */
    credentialProvider?: string;
    /** Effective model for display. */
    model?: string;
    source: EffectiveGenerationSource;
}

export interface GenerationSummary {
    provider: string;
    model?: string;
    source: EffectiveGenerationSource;
}

type GenerationCarrier = Pick<AIParticipant, 'generation_policy' | 'provider_config'>;

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(value, key);

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const nonEmptyString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

const finiteNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

interface ParticipantPlan {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    hasProviderPlan: boolean;
}

function participantPlan(participant: GenerationCarrier): ParticipantPlan {
    const policy = asRecord(participant.generation_policy);
    const carrier = participant.provider_config;
    // Policy is explicit-only (absent = inherit). A null policy means the
    // participant predates policies, so its recorded carrier is its plan.
    const policyProvider = nonEmptyString(policy?.provider);
    const policyModel = nonEmptyString(policy?.model);
    const carrierProvider = nonEmptyString(carrier?.provider);
    const carrierModel = nonEmptyString(carrier?.model);

    const provider = policyProvider ?? carrierProvider;
    const model = policyModel ?? carrierModel;

    const temperature =
        policy && hasOwn(policy, 'temperature') ? finiteNumber(policy.temperature) : undefined;
    const maxTokens =
        policy && hasOwn(policy, 'max_tokens') ? finiteNumber(policy.max_tokens) : undefined;

    return {
        provider,
        model,
        temperature,
        maxTokens,
        hasProviderPlan: Boolean(provider || model),
    };
}

/**
 * Resolve the effective browser-side plan.
 *
 * - Explicit participant provider/model: request only those fields; never
 *   borrow the unrelated global provider/model or its credential.
 * - No participant provider/model: the browser-global choice is the
 *   intentional override, with participant temperature/max-tokens (when
 *   recorded) winning over the global values.
 * - Neither: no request override; the server defaults stand.
 */
export function resolveEffectiveGeneration(
    participant: GenerationCarrier,
    global: BrowserGenerationConfig | null,
    getApiKey: (provider: string) => string | undefined,
): EffectiveGeneration {
    const plan = participantPlan(participant);

    if (plan.hasProviderPlan) {
        const credentialProvider = plan.provider;
        const settings: TurnGenerationSettings = {
            provider: plan.provider,
            model: plan.model,
            temperature: plan.temperature,
            maxTokens: plan.maxTokens,
        };
        if (credentialProvider) {
            const apiKey = getApiKey(credentialProvider);
            if (apiKey) settings.apiKey = apiKey;
        }

        return {
            settings,
            provider: plan.provider ?? 'default',
            credentialProvider,
            model: plan.model,
            source: 'participant',
        };
    }

    if (!global) {
        const settings: TurnGenerationSettings | undefined =
            plan.temperature !== undefined || plan.maxTokens !== undefined
                ? { temperature: plan.temperature, maxTokens: plan.maxTokens }
                : undefined;
        return {
            settings,
            provider: 'default',
            model: plan.model,
            source: 'server',
        };
    }

    const credentialProvider = global.provider;
    const settings: TurnGenerationSettings = {
        provider: global.provider,
        model: global.model,
        temperature: plan.temperature ?? global.temperature,
        maxTokens: plan.maxTokens ?? global.maxTokens,
        baseUrl: global.baseUrl,
    };
    if (credentialProvider) {
        const apiKey = getApiKey(credentialProvider);
        if (apiKey) settings.apiKey = apiKey;
    }

    return {
        settings,
        provider: global.provider ?? 'default',
        credentialProvider,
        model: plan.model ?? global.model,
        source: 'global',
    };
}

export function generationSummary(effective: EffectiveGeneration): GenerationSummary {
    return {
        provider: effective.provider,
        model: effective.model,
        source: effective.source,
    };
}
