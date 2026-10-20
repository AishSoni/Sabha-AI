// @vitest-environment happy-dom
/**
 * Regression (spec-02, settings hydration): when the provider metadata fetch
 * fails, the failure must be visible and retryable in the settings UI, and a
 * successful retry must hydrate the authoritative metadata into the store
 * (previously the persisted `initialized` flag silently blocked every later
 * hydration attempt).
 *
 * Since spec-05 the component reads the environment through the settings
 * feature query — this file keeps the component-level contract by mocking
 * that hook, while the query itself is pinned beside its feature api.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    view: {
        data: null as object | null,
        isLoading: false,
        error: null as object | null,
    },
    listeners: [] as Array<() => void>,
    notify: () => {
        for (const listener of mocks.listeners) {
            listener();
        }
    },
    // Stable dispatcher the component can capture once; the test swaps the
    // action behind it to represent the refetch resolving.
    refetchAction: () => undefined,
    refetch: () => {
        mocks.refetchAction();
        mocks.notify();
    },
}));

vi.mock('@/features/settings', () => ({
    useProvidersEnvironment: () => {
        const [, setTick] = useState(0);
        useEffect(() => {
            const listener = () => setTick((t) => t + 1);
            mocks.listeners.push(listener);
            return () => {
                const index = mocks.listeners.indexOf(listener);
                if (index !== -1) {
                    mocks.listeners.splice(index, 1);
                }
            };
        }, []);
        return {
            data: mocks.view.data,
            isLoading: mocks.view.isLoading,
            error: mocks.view.error,
            refetch: mocks.refetch,
        };
    },
}));

vi.mock('@/components/settings/provider-card', () => ({
    ProviderCard: () => <div data-testid="provider-card" />,
}));

vi.mock('@/components/settings/system-ai-card', () => ({
    SystemAICard: () => <div data-testid="system-ai-card" />,
}));

import { useEffect, useState } from 'react';
import { ApiKeysSection } from './api-keys-section';
import { useSettingsStore } from '@/stores/settings-store';

const metadataView = {
    providers: [],
    environment: {
        isProduction: false,
        configuredProviders: ['ollama'],
        defaultProvider: 'ollama',
        defaultModels: { ollama: 'llama3.2' },
    },
    systemAI: {
        provider: 'ollama',
        model: 'llama3.2',
        temperature: 0.5,
        maxTokens: 2048,
    },
};

beforeEach(() => {
    window.localStorage.clear();
    useSettingsStore.getState().resetAllSettings();
    useSettingsStore.getState().lockVault();
    vi.clearAllMocks();
    mocks.view.data = null;
    mocks.view.isLoading = false;
    mocks.view.error = null;
    mocks.listeners.length = 0;
});

describe('settings metadata failure visibility', () => {
    it('shows the failure with a retry, and retry hydrates the metadata', async () => {
        mocks.view.error = { message: 'boom' };

        render(<ApiKeysSection />);

        await screen.findByText('Failed to load providers');
        const retry = screen.getByRole('button', { name: /retry/i });
        expect(retry).toBeTruthy();

        // The refetch resolves the query: swapping the action behind the
        // stable dispatcher mirrors TanStack re-rendering on data.
        mocks.refetchAction = () => {
            mocks.view.error = null;
            mocks.view.data = metadataView;
        };
        fireEvent.click(retry);

        await screen.findByTestId('system-ai-card');
        expect(screen.queryByText('Failed to load providers')).toBeNull();
        await screen.findByText(/Keys are stored locally/);

        // The retry hydrates authoritative metadata into the store — even
        // though the section had already attempted this once.
        expect(useSettingsStore.getState().serverConfiguredProviders).toEqual(['ollama']);
        expect(useSettingsStore.getState().isProduction).toBe(false);
        expect(useSettingsStore.getState().providers.ollama.serverConfigured).toBe(true);
    });
});
