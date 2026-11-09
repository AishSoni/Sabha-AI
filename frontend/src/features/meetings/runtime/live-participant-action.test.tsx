// @vitest-environment happy-dom
/** Spec-37: execution, credential lookup, and cooldown share provider B. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/components/ui/rate-limited-button', () => ({
    RateLimitedButton: ({
        provider,
        onRateLimitedClick,
        children,
    }: {
        provider: string;
        onRateLimitedClick?: () => void;
        children?: ReactNode;
    }) => (
        <button data-provider={provider} onClick={onRateLimitedClick}>
            {children}
        </button>
    ),
}));

import { LiveParticipantAction } from './live-participant-action';
import { useSettingsStore } from '@/features/settings/state/settings-store';
import type { AIParticipant } from '../api/decoders';

const baseParticipant = {
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
} as AIParticipant;

async function configureBrowserAWithBKey() {
    const store = useSettingsStore.getState();
    await store.createVault('correct vault phrase');
    expect((await store.saveProviderKey('openrouter', 'sk-global-a')).ok).toBe(true);
    expect((await store.saveProviderKey('gemini', 'sk-participant-b')).ok).toBe(true);
    store.setProviderConfig('openrouter', {
        enabled: true,
        model: 'global/model-a',
        temperature: 0.4,
        maxTokens: 1000,
    });
    store.setDefaultProvider('openrouter');
}

describe('LiveParticipantAction effective configuration', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useSettingsStore.getState().resetAllSettings();
        useSettingsStore.getState().lockVault();
    });

    it('starts with participant provider B, B’s key, and B’s cooldown', async () => {
        await act(async () => {
            await configureBrowserAWithBKey();
        });
        const onStart = vi.fn();
        render(
            <LiveParticipantAction
                participant={{ ...baseParticipant, generation_policy: { provider: 'gemini' } }}
                isActive={false}
                isQueued={false}
                disabled={false}
                onStart={onStart}
            />,
        );

        const button = screen.getByRole('button');
        expect(button).toHaveAttribute('data-provider', 'gemini');
        fireEvent.click(button);

        expect(onStart).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'gemini',
                apiKey: 'sk-participant-b',
            }),
        );
        expect(onStart.mock.calls[0]?.[0]?.model).not.toBe('global/model-a');
    });

    it('uses the browser-global provider when the participant inherits', async () => {
        await act(async () => {
            await configureBrowserAWithBKey();
        });
        const onStart = vi.fn();
        render(
            <LiveParticipantAction
                participant={baseParticipant}
                isActive={false}
                isQueued={false}
                disabled={false}
                onStart={onStart}
            />,
        );

        const button = screen.getByRole('button');
        expect(button).toHaveAttribute('data-provider', 'openrouter');
        fireEvent.click(button);

        expect(onStart).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'openrouter',
                model: 'global/model-a',
                apiKey: 'sk-global-a',
            }),
        );
    });

    it('omits the key after the vault locks without changing the participant provider', async () => {
        await act(async () => {
            await configureBrowserAWithBKey();
        });
        const onStart = vi.fn();
        render(
            <LiveParticipantAction
                participant={{ ...baseParticipant, generation_policy: { provider: 'gemini' } }}
                isActive={false}
                isQueued={false}
                disabled={false}
                onStart={onStart}
            />,
        );

        act(() => useSettingsStore.getState().lockVault());
        fireEvent.click(screen.getByRole('button'));

        const settings = onStart.mock.calls[0]?.[0];
        expect(settings?.provider).toBe('gemini');
        expect(settings?.apiKey).toBeUndefined();
    });
});
