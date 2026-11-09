/** Spec-37: one effective participant generation configuration. */
import { describe, expect, it, vi } from 'vitest';
import { resolveEffectiveGeneration, type BrowserGenerationConfig } from './effective-generation';
import type { AIParticipant } from '../api/decoders';

function participant(overrides: Partial<AIParticipant> = {}): AIParticipant {
    return {
        id: 'p1',
        meeting_id: 'm1',
        name: 'The CTO',
        role: 'CTO',
        system_prompt: 'prompt',
        provider_config: { provider: '', model: '', temperature: 0.7, max_tokens: 2048 },
        color: '#6366f1',
        persona_id: 'persona-1',
        stack_ids: [],
        created_at: '2026-01-01T00:00:00Z',
        generation_policy: {},
        ...overrides,
    } as AIParticipant;
}

const globalA: BrowserGenerationConfig = {
    provider: 'openrouter',
    model: 'global/model-a',
    temperature: 0.4,
    maxTokens: 1000,
};

describe('resolveEffectiveGeneration', () => {
    it('uses an explicit participant provider B without borrowing global A', () => {
        const getKey = vi.fn((provider: string) => (provider === 'gemini' ? 'sk-gemini' : 'sk-a'));
        const effective = resolveEffectiveGeneration(
            participant({ generation_policy: { provider: 'gemini' } }),
            globalA,
            getKey,
        );

        expect(effective.settings).toMatchObject({ provider: 'gemini', apiKey: 'sk-gemini' });
        expect(effective.settings?.model).toBeUndefined();
        expect(effective.provider).toBe('gemini');
        expect(effective.source).toBe('participant');
        expect(getKey).toHaveBeenCalledTimes(1);
        expect(getKey).toHaveBeenCalledWith('gemini');
    });

    it('uses the global choice when the participant has no provider plan', () => {
        const effective = resolveEffectiveGeneration(participant(), globalA, () => 'sk-a');

        expect(effective.settings).toMatchObject({
            provider: 'openrouter',
            model: 'global/model-a',
            temperature: 0.4,
            maxTokens: 1000,
            apiKey: 'sk-a',
        });
        expect(effective.provider).toBe('openrouter');
        expect(effective.source).toBe('global');
    });

    it('keeps a participant temperature override while inheriting the global provider', () => {
        const effective = resolveEffectiveGeneration(
            participant({ generation_policy: { temperature: 0 } }),
            globalA,
            () => 'sk-a',
        );

        expect(effective.settings?.temperature).toBe(0);
        expect(effective.settings?.provider).toBe('openrouter');
        expect(effective.source).toBe('global');
    });

    it('does not attach a key when an explicit model has no known provider', () => {
        const getKey = vi.fn(() => 'sk-a');
        const effective = resolveEffectiveGeneration(
            participant({ generation_policy: { model: 'gemini-2.0-flash' } }),
            globalA,
            getKey,
        );

        expect(effective.settings).toMatchObject({ model: 'gemini-2.0-flash' });
        expect(effective.settings?.provider).toBeUndefined();
        expect(effective.settings?.apiKey).toBeUndefined();
        expect(effective.credentialProvider).toBeUndefined();
        expect(effective.provider).toBe('default');
        expect(getKey).not.toHaveBeenCalled();
    });

    it('falls back to server defaults when neither participant nor browser select a provider', () => {
        const effective = resolveEffectiveGeneration(participant(), null, () => undefined);

        expect(effective.settings).toBeUndefined();
        expect(effective.provider).toBe('default');
        expect(effective.source).toBe('server');
    });

    it('treats a legacy provider snapshot as the participant plan', () => {
        const effective = resolveEffectiveGeneration(
            participant({
                generation_policy: null,
                provider_config: {
                    provider: 'gemini',
                    model: 'gemini-2.0-flash',
                    temperature: 0.2,
                    max_tokens: 512,
                },
            }),
            globalA,
            (provider) => (provider === 'gemini' ? 'sk-gemini' : undefined),
        );

        expect(effective.settings).toMatchObject({
            provider: 'gemini',
            model: 'gemini-2.0-flash',
            apiKey: 'sk-gemini',
        });
        expect(effective.settings?.model).not.toBe('global/model-a');
        expect(effective.source).toBe('participant');
    });
});
