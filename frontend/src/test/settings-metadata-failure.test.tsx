// @vitest-environment happy-dom
/**
 * Regression (spec-02, settings hydration): when the provider metadata fetch
 * fails, the failure must be visible and retryable in the settings UI, and a
 * successful retry must hydrate the authoritative metadata into the store
 * (previously the persisted `initialized` flag silently blocked every later
 * hydration attempt).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    getProviders: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
    settingsApi: { getProviders: mocks.getProviders },
    ProviderInfo: {},
    FetchedModelInfo: {},
}));

vi.mock('@/components/settings/provider-card', () => ({
    ProviderCard: () => <div data-testid="provider-card" />,
}));

vi.mock('@/components/settings/system-ai-card', () => ({
    SystemAICard: () => <div data-testid="system-ai-card" />,
}));

import { ApiKeysSection } from '../components/settings/api-keys-section';
import { useSettingsStore } from '@/stores/settings-store';

const providersPayload = {
    providers: [
        { id: 'openrouter', name: 'OpenRouter', models: [] },
        { id: 'gemini', name: 'Gemini', models: [] },
        { id: 'ollama', name: 'Ollama', models: [] },
    ],
    environment: {
        is_production: false,
        configured_providers: ['ollama'],
        default_provider: 'ollama',
        default_models: { ollama: 'llama3.2' },
    },
    system_ai: {
        provider: 'ollama',
        model: 'llama3.2',
        temperature: 0.5,
        max_tokens: 2048,
    },
};

beforeEach(() => {
    window.localStorage.clear();
    useSettingsStore.getState().resetAllSettings();
    useSettingsStore.getState().lockVault();
    vi.clearAllMocks();
});

describe('settings metadata failure visibility', () => {
    it('shows the failure with a retry, and retry hydrates the metadata', async () => {
        mocks.getProviders.mockRejectedValueOnce(new Error('boom'));
        render(<ApiKeysSection />);

        await screen.findByText('Failed to load providers');
        const retry = screen.getByRole('button', { name: /retry/i });
        expect(retry).toBeTruthy();

        mocks.getProviders.mockResolvedValueOnce(providersPayload);
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
