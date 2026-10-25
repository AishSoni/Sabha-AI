/**
 * System AI is server policy (spec-10): the card edits a draft and commits it
 * through the feature mutation. It must never write a local preference while
 * pretending the server accepted it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    updateSystemAI: vi.fn(),
    fetchModels: vi.fn(),
}));

vi.mock('../api', async () => {
    const actual = await vi.importActual<typeof import('../api')>('../api');
    return {
        ...actual,
        useUpdateSystemAI: () => ({
            mutateAsync: mocks.updateSystemAI,
            isPending: false,
            isError: false,
            error: null,
        }),
        useFetchProviderModels: () => ({
            mutateAsync: mocks.fetchModels,
            data: undefined,
            isPending: false,
        }),
    };
});

import { SystemAiCard } from './SystemAiCard';

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
];

function renderCard(overrides: Partial<{ temperature: number; maxTokens: number }> = {}) {
    const systemAI = {
        provider: 'ollama',
        model: 'llama3.2',
        temperature: overrides.temperature ?? 0.5,
        maxTokens: overrides.maxTokens ?? 2048,
    };
    const view = render(
        <SystemAiCard providers={PROVIDERS} systemAI={systemAI} defaultProvider="ollama" />
    );
    return { ...view, systemAI };
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
        mocks.fetchModels.mockReset();
        mocks.fetchModels.mockResolvedValue({ success: true, models: [], message: '' });
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
});
