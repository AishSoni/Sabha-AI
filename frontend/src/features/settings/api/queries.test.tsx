// @vitest-environment happy-dom
/**
 * Contract for the settings metadata environment query (spec-05).
 *
 * The provider environment is server state, not zustand state: TanStack Query
 * owns the read, the keys stay inside the settings feature, and the wire
 * carries no sign-in or credential headers. Error messages come from the
 * server (detail) beside a plain HTTP kind — the client layer never invents
 * or appends credential material.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { createScriptedFetch } from '../../../../tests/fixtures/transport';
import { makeQueryClient } from '@/app/providers';
import { resolveApiBaseUrl } from '@/shared/api/transport';
import { useProvidersEnvironment, settingsKeys } from './queries';

import type { ScriptedFetch } from '../../../../tests/fixtures/transport';

const providersPayload = {
    providers: [
        {
            id: 'openrouter',
            name: 'OpenRouter',
            description: 'Gateway',
            requires_api_key: true,
            models: [
                {
                    id: 'm-1',
                    name: 'Model 1',
                    context_length: 8192,
                    supports_tools: true,
                    supports_streaming: true,
                },
            ],
            default_model: 'm-1',
            default_temperature: 0.7,
            default_max_tokens: 2048,
        },
        {
            id: 'ollama',
            name: 'Ollama',
            description: 'Local',
            requires_api_key: false,
            base_url: 'http://localhost:11434',
            models: [],
            default_model: '',
            default_temperature: 0.7,
            default_max_tokens: 2048,
        },
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

describe('settings metadata environment query', () => {
    let scripted: ScriptedFetch;

    function wrapper({ children }: { children: ReactNode }) {
        const [client] = useState(() => makeQueryClient());
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }

    beforeEach(() => {
        scripted = createScriptedFetch();
        scripted.install();
    });

    afterEach(() => {
        scripted.reset();
        vi.unstubAllGlobals();
    });

    it('pins an isolated settings identities namespace', () => {
        expect(settingsKeys.all).toEqual(['settings']);
        expect(settingsKeys.providers()).toEqual(['settings', 'providers']);
        expect(settingsKeys.providers()).not.toEqual(settingsKeys.all);
    });

    it('reads the environment over a no-sign-in GET and decodes camelCase view', async () => {
        scripted.enqueueJson(200, providersPayload);

        const { result } = renderHook(() => useProvidersEnvironment(), { wrapper });
        await waitFor(() => expect(result.current.data).toBeTruthy());

        expect(result.current.data!.providers).toHaveLength(2);
        expect(result.current.data!.providers[0]).toMatchObject({
            id: 'openrouter',
            name: 'OpenRouter',
            requires_api_key: true,
            models: [{ id: 'm-1', name: 'Model 1' }],
        });
        expect(result.current.data!.providers[1]).toMatchObject({
            id: 'ollama',
            base_url: 'http://localhost:11434',
        });
        expect(result.current.data!.environment).toEqual({
            isProduction: false,
            configuredProviders: ['ollama'],
            defaultProvider: 'ollama',
            defaultModels: { ollama: 'llama3.2' },
        });
        expect(result.current.data!.systemAI).toEqual({
            provider: 'ollama',
            model: 'llama3.2',
            temperature: 0.5,
            maxTokens: 2048,
        });

        const call = scripted.calls[0]!;
        expect(call.input).toBe(`${resolveApiBaseUrl()}/settings/providers`);
        const headers = (call.init?.headers ?? {}) as Record<string, string>;
        for (const key of Object.keys(headers)) {
            expect(key.toLowerCase()).not.toMatch(/^authorization$|cookie|x-user-|^x-provider-key/);
        }
    });

    it('surfaces failed metadata reads as retryable query errors', async () => {
        scripted.enqueueJson(500, { detail: 'provider directory unavailable' });

        // Retry policy is a client-level decision; the contract here is that
        // the failure becomes a surfaced query error with the server detail
        // and HTTP status — so pin it on a retry-free client.
        const retryFreeClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const retryFreeWrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={retryFreeClient}>{children}</QueryClientProvider>
        );

        const { result } = renderHook(() => useProvidersEnvironment(), { wrapper: retryFreeWrapper });
        await waitFor(() => expect(result.current.error).toBeTruthy());

        const error = result.current.error as Error & { status?: number | null };
        expect(error.message).toBe('provider directory unavailable');
        expect(error.status).toBe(500);
    });
});
