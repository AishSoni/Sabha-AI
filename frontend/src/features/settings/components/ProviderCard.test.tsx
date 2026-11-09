// @vitest-environment happy-dom
/**
 * Spec-37: the key field is a transient draft, never the sealed credential.
 * Save/test must resolve credentials at click time and report locked-vault
 * blockers instead of sending a blank key or dropping input.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';

const mocks = vi.hoisted(() => ({
    fetchModels: vi.fn(),
    testKey: vi.fn(),
    saveKey: vi.fn(),
}));

vi.mock('../api', () => ({
    useFetchProviderModels: () => ({
        mutateAsync: mocks.fetchModels,
        isPending: false,
    }),
    useTestProviderKey: () => ({
        mutateAsync: mocks.testKey,
        isPending: false,
    }),
}));

import { ProviderCard } from './ProviderCard';

const PROVIDER = {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Cloud models',
    requires_api_key: true,
    models: [],
    default_model: 'openrouter/auto',
    default_temperature: 0.7,
    default_max_tokens: 2048,
};

const CONFIG = {
    enabled: false,
    model: '',
    temperature: 0.7,
    maxTokens: 2048,
    serverConfigured: false,
};

function renderCard(overrides: Partial<ComponentProps<typeof ProviderCard>> = {}) {
    return render(
        <ProviderCard
            provider={PROVIDER}
            config={CONFIG}
            isDefault={false}
            storedKey={false}
            vaultUnlocked={false}
            vaultEpoch={0}
            onConfigChange={vi.fn()}
            onSaveKey={mocks.saveKey}
            onRemoveKey={vi.fn()}
            onResolveStoredKey={() => undefined}
            onSetDefault={vi.fn()}
            {...overrides}
        />
    );
}

describe('ProviderCard credential controls', () => {
    beforeEach(() => {
        mocks.fetchModels.mockReset();
        mocks.fetchModels.mockResolvedValue({ success: true, models: [], message: '' });
        mocks.testKey.mockReset();
        mocks.testKey.mockResolvedValue({ valid: true, message: 'Key is valid' });
        mocks.saveKey.mockReset();
        mocks.saveKey.mockResolvedValue({ ok: true });
    });

    it('keeps a locked save visible and does not call the vault', async () => {
        renderCard();

        fireEvent.change(screen.getByLabelText(/Browser API Key/i), {
            target: { value: 'sk-draft' },
        });
        fireEvent.click(screen.getByRole('button', { name: /save key/i }));

        await screen.findByText(/Unlock or create the key vault above/i);
        expect(mocks.saveKey).not.toHaveBeenCalled();
    });

    it('saves a draft only when the vault is unlocked', async () => {
        const { rerender } = renderCard();
        const props = {
            provider: PROVIDER,
            config: CONFIG,
            isDefault: false,
            storedKey: false,
            vaultUnlocked: true,
            vaultEpoch: 0,
            onConfigChange: vi.fn(),
            onSaveKey: mocks.saveKey,
            onRemoveKey: vi.fn(),
            onResolveStoredKey: () => undefined,
            onSetDefault: vi.fn(),
        };

        rerender(<ProviderCard {...props} />);
        fireEvent.change(screen.getByLabelText(/Browser API Key/i), {
            target: { value: 'sk-draft' },
        });
        fireEvent.click(screen.getByRole('button', { name: /save key/i }));

        await screen.findByText(/Key saved encrypted/i);
        expect(mocks.saveKey).toHaveBeenCalledWith('sk-draft');
    });

    it('blocks testing a stored key while the vault is locked', async () => {
        renderCard({ storedKey: true, vaultUnlocked: false });

        expect(screen.getByText(/Stored key · encrypted/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^test$/i }));

        await screen.findByText(/Unlock the key vault above to use the stored key/i);
        expect(mocks.testKey).not.toHaveBeenCalled();
    });

    it('tests a transient draft without persisting it', async () => {
        const onConfigChange = vi.fn();
        renderCard({ onConfigChange });

        fireEvent.change(screen.getByLabelText(/Browser API Key/i), {
            target: { value: 'sk-draft' },
        });
        fireEvent.click(screen.getByRole('button', { name: /^test$/i }));

        await waitFor(() =>
            expect(mocks.testKey).toHaveBeenCalledWith({
                provider: 'openrouter',
                apiKey: 'sk-draft',
                baseUrl: undefined,
            })
        );
        expect(onConfigChange).toHaveBeenCalledWith({ enabled: true });
        expect(await screen.findByText('Reachable')).toBeTruthy();
    });

    it('does not present an enabled provider as a successful probe', async () => {
        renderCard({ config: { ...CONFIG, enabled: true } });

        expect(screen.getByText('Enabled')).toBeTruthy();
        expect(screen.queryByText('Active')).toBeNull();
        expect(screen.queryByText('Reachable')).toBeNull();
        expect(await screen.findByText(/Save an API key to load models/i)).toBeTruthy();
    });

    it('discards a connection result when the draft changes while testing', async () => {
        let resolveTest: (value: { valid: boolean; message: string }) => void = () => {};
        mocks.testKey.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveTest = resolve;
            })
        );
        const onConfigChange = vi.fn();
        renderCard({ onConfigChange });
        const input = screen.getByLabelText(/Browser API Key/i);

        fireEvent.change(input, { target: { value: 'sk-first' } });
        fireEvent.click(screen.getByRole('button', { name: /^test$/i }));
        await waitFor(() => expect(mocks.testKey).toHaveBeenCalledTimes(1));

        fireEvent.change(input, { target: { value: 'sk-second' } });
        await act(async () => {
            resolveTest({ valid: true, message: 'Key is valid' });
        });

        expect(onConfigChange).not.toHaveBeenCalledWith({ enabled: true });
        expect(screen.queryByText('Reachable')).toBeNull();
        expect(screen.queryByText('Key is valid')).toBeNull();
    });

    it('does not apply models discovered for an earlier credential', async () => {
        let resolveModels: (value: {
            success: boolean;
            models: { id: string; name: string; context_length: number }[];
            message: string;
        }) => void = () => {};
        mocks.fetchModels.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveModels = resolve;
            })
        );
        const onConfigChange = vi.fn();
        renderCard({ onConfigChange });
        const input = screen.getByLabelText(/Browser API Key/i);

        fireEvent.change(input, { target: { value: 'sk-first' } });
        fireEvent.click(screen.getByRole('button', { name: /Refresh models/i }));
        await waitFor(() => expect(mocks.fetchModels).toHaveBeenCalledTimes(1));

        fireEvent.change(input, { target: { value: 'sk-second' } });
        await act(async () => {
            resolveModels({
                success: true,
                models: [{ id: 'late-model', name: 'Late Model', context_length: 4096 }],
                message: '',
            });
        });

        expect(screen.queryByText('Late Model')).toBeNull();
        expect(onConfigChange).not.toHaveBeenCalledWith({ model: 'late-model' });
    });

    it('does not overwrite a model chosen while discovery is pending', async () => {
        let resolveModels: (value: {
            success: boolean;
            models: { id: string; name: string; context_length: number }[];
            message: string;
        }) => void = () => {};
        mocks.fetchModels.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveModels = resolve;
            })
        );
        const onConfigChange = vi.fn();
        const props = {
            provider: PROVIDER,
            config: CONFIG,
            isDefault: false,
            storedKey: false,
            vaultUnlocked: false,
            vaultEpoch: 0,
            onConfigChange,
            onSaveKey: mocks.saveKey,
            onRemoveKey: vi.fn(),
            onResolveStoredKey: () => undefined,
            onSetDefault: vi.fn(),
        };
        const { rerender } = render(<ProviderCard {...props} />);

        fireEvent.change(screen.getByLabelText(/Browser API Key/i), {
            target: { value: 'sk-draft' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Refresh models/i }));
        await waitFor(() => expect(mocks.fetchModels).toHaveBeenCalledTimes(1));

        rerender(
            <ProviderCard
                {...props}
                config={{ ...CONFIG, model: 'chosen-model' }}
            />
        );
        await act(async () => {
            resolveModels({
                success: true,
                models: [{ id: 'first-model', name: 'First Model', context_length: 4096 }],
                message: '',
            });
        });

        expect(onConfigChange).not.toHaveBeenCalledWith({ model: 'first-model' });
    });
});
