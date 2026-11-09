/**
 * Persisted provider configurations can outlive the provider catalogue
 * (spec-38 requirement 8). Unknown entries must stay visible as unsupported
 * instead of being silently dropped, and must be removable without any network
 * call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const fixtures = vi.hoisted(() => ({
    metadata: {
        providers: [
            {
                id: 'ollama',
                name: 'Ollama',
                description: 'Local models',
                requires_api_key: false,
                models: [],
                default_model: 'llama3.2',
                default_temperature: 0.7,
                default_max_tokens: 2048,
            },
        ],
        environment: {
            isProduction: false,
            configuredProviders: ['ollama'],
            defaultProvider: 'ollama',
            defaultModels: {},
        },
        systemAI: {
            provider: 'ollama',
            model: '',
            temperature: 0.5,
            maxTokens: 2048,
        },
        systemAIStatus: {
            source: 'environment',
            state: 'missing',
            degraded: false,
            message: 'No saved System AI policy is stored.',
        },
    },
}));

vi.mock('./SettingsMetadata', () => ({
    SettingsMetadata: ({ children }: { children: (metadata: unknown) => unknown }) =>
        children(fixtures.metadata),
}));

vi.mock('./ProviderCard', () => ({
    ProviderCard: ({ provider }: { provider: { id: string } }) => (
        <div data-testid={`provider-${provider.id}`} />
    ),
}));

import { ProvidersSection } from './ProvidersSection';
import { useSettingsStore, type ProviderConfig } from '../state/settings-store';

const UNKNOWN_CONFIG: ProviderConfig = {
    enabled: true,
    model: 'mystery-model',
    temperature: 0.5,
    maxTokens: 2048,
    baseUrl: 'http://localhost:9999',
};

describe('ProvidersSection', () => {
    beforeEach(() => {
        useSettingsStore.getState().resetAllSettings();
        useSettingsStore.setState((state) => ({
            providers: {
                ...state.providers,
                mystery: UNKNOWN_CONFIG,
            } as typeof state.providers,
        }));
    });

    it('renders a persisted unknown provider as unsupported and removes it', () => {
        render(<ProvidersSection />);

        expect(screen.getByTestId('provider-ollama')).toBeTruthy();
        expect(screen.getByText('mystery')).toBeTruthy();
        expect(screen.getByText('Unsupported')).toBeTruthy();
        expect(screen.getByText('mystery-model')).toBeTruthy();
        expect(screen.queryByTestId('provider-mystery')).toBeNull();

        fireEvent.click(
            screen.getByRole('button', { name: /Remove saved configuration/i })
        );

        expect(screen.queryByText('mystery')).toBeNull();
        expect(useSettingsStore.getState().providers).not.toHaveProperty('mystery');
    });

    it('renders a server provider unknown to this build as unsupported', () => {
        useSettingsStore.setState((state) => {
            const providers = { ...state.providers } as Record<string, ProviderConfig>;
            delete providers.mystery;
            return { providers: providers as typeof state.providers };
        });
        fixtures.metadata.providers.push({
            id: 'future-provider',
            name: 'Future Provider',
            description: 'Not supported by this build',
            requires_api_key: true,
            models: [],
            default_model: 'future-model',
            default_temperature: 0.7,
            default_max_tokens: 2048,
        });

        try {
            render(<ProvidersSection />);

            expect(screen.getByText('future-provider')).toBeTruthy();
            expect(screen.getByText('Unsupported')).toBeTruthy();
            expect(screen.queryByTestId('provider-future-provider')).toBeNull();
            expect(
                screen.queryByRole('button', {
                    name: /Remove saved configuration/i,
                })
            ).toBeNull();
        } finally {
            fixtures.metadata.providers.pop();
        }
    });
});
