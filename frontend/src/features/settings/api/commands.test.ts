/**
 * Provider command wire contract (spec-10).
 *
 * Model discovery and key tests are explicit POST commands. They may carry a
 * decrypted BYOK key in the body (the backend proxy contract), but never in
 * headers or query parameters, and they are not cached reads. System AI is a
 * validated server mutation carrying policy only, never credentials.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createScriptedFetch } from '../../../../tests/fixtures/transport';
import type { ScriptedFetch } from '../../../../tests/fixtures/transport';
import { resolveApiBaseUrl } from '@/shared/api/transport';
import { settingsClient } from './client';

describe('settings provider commands', () => {
    let scripted: ScriptedFetch;

    beforeEach(() => {
        scripted = createScriptedFetch();
        scripted.install();
    });

    afterEach(() => {
        scripted.reset();
        vi.unstubAllGlobals();
    });

    it('posts model discovery as a one-shot command without credential headers', async () => {
        scripted.enqueueJson(200, {
            success: true,
            models: [{ id: 'm-1', name: 'Model 1', context_length: 8192 }],
            message: 'ok',
        });

        const result = await settingsClient.fetchModels({
            provider: 'gemini',
            apiKey: 'sk-live-secret',
            baseUrl: 'http://localhost:11434',
        });

        expect(result).toEqual({
            success: true,
            models: [{ id: 'm-1', name: 'Model 1', context_length: 8192 }],
            message: 'ok',
        });
        const call = scripted.calls[0]!;
        expect(call.input).toBe(`${resolveApiBaseUrl()}/settings/models`);
        expect(call.init?.method).toBe('POST');
        expect(JSON.parse(String(call.init?.body))).toEqual({
            provider: 'gemini',
            api_key: 'sk-live-secret',
            base_url: 'http://localhost:11434',
        });
        const headers = (call.init?.headers ?? {}) as Record<string, string>;
        for (const key of Object.keys(headers)) {
            expect(key.toLowerCase()).not.toMatch(/^authorization$|cookie|x-user-|^x-provider-key/);
        }
    });

    it('tests a provider key and decodes the verdict', async () => {
        scripted.enqueueJson(200, {
            valid: false,
            message: 'invalid key',
            models: ['m-1'],
        });

        await expect(
            settingsClient.testKey({ provider: 'openrouter', apiKey: 'sk-bad' }),
        ).resolves.toEqual({ valid: false, message: 'invalid key', models: ['m-1'] });

        const call = scripted.calls[0]!;
        expect(call.input).toBe(`${resolveApiBaseUrl()}/settings/test-key`);
        expect(JSON.parse(String(call.init?.body))).toEqual({
            provider: 'openrouter',
            api_key: 'sk-bad',
        });
    });

    it('saves System AI as a validated policy mutation without credentials', async () => {
        scripted.enqueueJson(200, {
            provider: 'ollama',
            model: 'llama3.2',
            temperature: 0.2,
            max_tokens: 900,
        });

        await expect(
            settingsClient.updateSystemAI({
                provider: 'ollama',
                model: 'llama3.2',
                temperature: 0.2,
                maxTokens: 900,
            }),
        ).resolves.toEqual({
            provider: 'ollama',
            model: 'llama3.2',
            temperature: 0.2,
            maxTokens: 900,
        });

        const call = scripted.calls[0]!;
        expect(call.input).toBe(`${resolveApiBaseUrl()}/settings/system-ai`);
        expect(call.init?.method).toBe('PUT');
        expect(JSON.parse(String(call.init?.body))).toEqual({
            provider: 'ollama',
            model: 'llama3.2',
            temperature: 0.2,
            max_tokens: 900,
        });
        const headers = (call.init?.headers ?? {}) as Record<string, string>;
        for (const key of Object.keys(headers)) {
            expect(key.toLowerCase()).not.toMatch(/^authorization$|cookie|x-user-|^x-provider-key/);
        }
    });
});
