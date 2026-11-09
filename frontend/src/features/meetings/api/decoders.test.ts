/** Spec-37: the participant policy must survive the wire decoder. */
import { describe, expect, it } from 'vitest';
import { decodeParticipant } from './decoders';

describe('decodeParticipant generation policy', () => {
    it('preserves explicit policy fields and a null legacy policy', () => {
        const policy = decodeParticipant(
            {
                id: 'p1',
                meeting_id: 'm1',
                name: 'The CTO',
                role: 'CTO',
                system_prompt: 'prompt',
                provider_config: { provider: '', model: '', temperature: 0.7, max_tokens: 2048 },
                generation_policy: { provider: 'gemini', temperature: 0 },
                color: '#6366f1',
                persona_id: null,
                stack_ids: null,
                created_at: '2026-01-01T00:00:00Z',
            },
            'participant',
        );
        expect(policy.generation_policy).toEqual({ provider: 'gemini', temperature: 0 });

        const legacy = decodeParticipant(
            {
                id: 'p2',
                meeting_id: 'm1',
                name: 'The Investor',
                role: 'Investor',
                system_prompt: 'prompt',
                provider_config: { provider: '', model: '', temperature: 0.7, max_tokens: 2048 },
                generation_policy: null,
                color: '#6366f1',
                persona_id: null,
                stack_ids: null,
                created_at: '2026-01-01T00:00:00Z',
            },
            'participant',
        );
        expect(legacy.generation_policy).toBeNull();
    });
});
