/**
 * System AI is server policy (spec-10): the card edits a draft and commits it
 * through the feature mutation. It must never write a local preference while
 * pretending the server accepted it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    updateSystemAI: vi.fn(),
    fetchModels: vi.fn(),
    updateState: {
        isPending: false,
        isError: false,
        error: null as Error | null,
    },
}));

vi.mock('../api', async () => {
    const actual = await vi.importActual<typeof import('../api')>('../api');
    return {
        ...actual,
        useUpdateSystemAI: () => ({
            mutateAsync: mocks.updateSystemAI,
            ...mocks.updateState,
        }),
        useFetchProviderModels: () => ({
            mutateAsync: mocks.fetchModels,
        }),
    };
});

import { SystemAiCard } from './SystemAiCard';
import type { SystemAIStatusView } from '../api';

const PROVIDERS = [
    {
        id: 'ollama',
        name: 'Ollama',
        description: 'Local models',
        requires_api_key: false,
        default_model: 'llama3.2',
        default_temperature: 0.7,
        default_max_tokens: 2048,
        models: [],
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Cloud models',
        requires_api_key: true,
        default_model: 'openrouter/auto',
        default_temperature: 0.7,
        default_max_tokens: 2048,
        models: [],
    },
];

const STATUS: SystemAIStatusView = {
    source: 'stored',
    state: 'available',
    degraded: false,
    message: 'Saved System AI policy loaded.',
};

function renderCard(
    overrides: Partial<{ temperature: number; maxTokens: number }> = {},
    status: Partial<SystemAIStatusView> = {}
) {
    const systemAI = {
        provider: 'ollama',
        model: 'llama3.2',
        temperature: overrides.temperature ?? 0.5,
        maxTokens: overrides.maxTokens ?? 2048,
    };
    const view = render(
        <SystemAiCard
            providers={PROVIDERS}
            systemAI={systemAI}
            systemAIStatus={{ ...STATUS, ...status }}
            defaultProvider="ollama"
        />
    );
    return { ...view, systemAI, status: { ...STATUS, ...status } };
}

describe('SystemAiCard', () => {
    beforeEach(() => {
        mocks.updateSystemAI.mockReset();
        mocks.updateSystemAI.mockResolvedValue({
            provider: 'ollama',
            model: 'llama3.2',
            temperature: 0.5,
            maxTokens: 900,
        });
        mocks.updateState.isPending = false;
        mocks.updateState.isError = false;
        mocks.updateState.error = null;
        mocks.fetchModels.mockReset();
        mocks.fetchModels.mockReturnValue(new Promise(() => {}));
    });

    it('shows the confirmed server snapshot and follows refreshed policy', () => {
        const { rerender } = renderCard({ maxTokens: 2048 });
        const input = screen.getByLabelText(/Max Tokens/i);
        expect(input).toHaveValue(2048);

        rerender(
            <SystemAiCard
                providers={PROVIDERS}
                systemAI={{
                    provider: 'ollama',
                    model: 'llama3.2',
                    temperature: 0.2,
                    maxTokens: 4096,
                }}
                systemAIStatus={STATUS}
                defaultProvider="ollama"
            />
        );
        expect(input).toHaveValue(4096);
    });

    it('commits an edited draft through the server mutation', async () => {
        renderCard();
        const input = screen.getByLabelText(/Max Tokens/i);
        fireEvent.change(input, { target: { value: '900' } });
        fireEvent.click(screen.getByRole('button', { name: /Save System AI/i }));

        await waitFor(() => {
            expect(mocks.updateSystemAI).toHaveBeenCalledWith({
                provider: 'ollama',
                model: 'llama3.2',
                temperature: 0.5,
                maxTokens: 900,
            });
        });
    });

    it('refuses to submit an out-of-range policy', () => {
        renderCard();
        fireEvent.change(screen.getByLabelText(/Max Tokens/i), {
            target: { value: '10' },
        });
        const save = screen.getByRole('button', { name: /Save System AI/i });
        expect(save).toBeDisabled();
        expect(screen.getByText(/Max tokens must be between 256 and 16000/i)).toBeInTheDocument();
        expect(mocks.updateSystemAI).not.toHaveBeenCalled();
    });

    it('shows an environment default as missing policy, not a saved policy', () => {
        renderCard(
            {},
            {
                source: 'environment',
                state: 'missing',
                message: 'No saved System AI policy is stored; environment defaults are in effect.',
            }
        );

        expect(screen.getByText('Environment default')).toBeTruthy();
        expect(
            screen.getByText(/No saved System AI policy is stored/i)
        ).toBeTruthy();
        expect(screen.queryByText('Saved policy')).toBeNull();
    });

    it('shows a storage read failure as degraded', () => {
        renderCard(
            {},
            {
                source: 'fallback',
                state: 'failed',
                degraded: true,
                message:
                    'The saved System AI policy could not be read. Environment defaults are in effect until storage recovers.',
            }
        );

        expect(screen.getByText('Storage read failed')).toBeTruthy();
        expect(screen.getByText('Degraded')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain(
            'could not be read'
        );
    });

    it('distinguishes a successful empty inventory from a discovery failure', async () => {
        mocks.fetchModels.mockResolvedValueOnce({
            success: true,
            models: [],
            message: '',
        });
        renderCard();

        expect(await screen.findByText(/returned no models/i)).toBeTruthy();
        expect(screen.queryByText(/Model discovery failed/i)).toBeNull();
    });

    it('keeps a provider discovery failure distinct from an empty inventory', async () => {
        mocks.fetchModels.mockResolvedValueOnce({
            success: false,
            models: [],
            message: 'Invalid API key',
        });
        renderCard();

        expect(
            await screen.findByText(/Model discovery failed. Invalid API key/i)
        ).toBeTruthy();
        expect(screen.queryByText(/returned no models/i)).toBeNull();
        expect(screen.getByRole('button', { name: /^retry$/i })).toBeTruthy();
    });

    it('keeps a transport failure distinct from an empty inventory', async () => {
        mocks.fetchModels.mockRejectedValueOnce(new Error('network unavailable'));
        renderCard();

        expect(
            await screen.findByText(/could not reach the settings API/i)
        ).toBeTruthy();
        expect(screen.queryByText(/returned no models/i)).toBeNull();
    });

    it('does not show a late discovery result for the previous provider', async () => {
        let resolveFirst: (value: {
            success: boolean;
            models: { id: string; name: string; context_length: number }[];
            message: string;
        }) => void = () => {};
        mocks.fetchModels
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveFirst = resolve;
                })
            )
            .mockResolvedValueOnce({
                success: true,
                models: [],
                message: '',
            });
        const systemAI = {
            provider: 'ollama',
            model: 'llama3.2',
            temperature: 0.5,
            maxTokens: 2048,
        };
        const { rerender } = renderCard();
        await waitFor(() => expect(mocks.fetchModels).toHaveBeenCalledTimes(1));

        rerender(
            <SystemAiCard
                providers={PROVIDERS}
                systemAI={{ ...systemAI, provider: 'openrouter' }}
                systemAIStatus={STATUS}
                defaultProvider="ollama"
            />
        );
        await waitFor(() => expect(mocks.fetchModels).toHaveBeenCalledTimes(2));
        expect(await screen.findByText(/returned no models/i)).toBeTruthy();

        await act(async () => {
            resolveFirst({
                success: true,
                models: [
                    { id: 'stale-model', name: 'Stale Model', context_length: 4096 },
                ],
                message: '',
            });
        });

        // The stale result must not replace the current provider's empty state
        // with a loading/other-provider state.
        expect(screen.getByText(/returned no models/i)).toBeTruthy();
    });

    it('keeps the existing save failure alert', () => {
        mocks.updateState.isError = true;
        mocks.updateState.error = new Error('Database unavailable');
        renderCard();

        expect(
            screen.getByText(/System AI was not saved. Database unavailable/i)
        ).toBeTruthy();
    });
});
