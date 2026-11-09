/**
 * Typed HTTP client for coordinated closing (spec-08).
 *
 * Requesting a close is admission plus a best-effort drive, not a promise
 * that a summary exists: it returns a durable receipt. Observation is a
 * read-only GET and never starts or resumes generation. Retry and abort are
 * separate explicit commands, so no GET can replay paid work.
 */
import { requestLiveJson } from '@/shared/access';
import {
    decodeClosingCapability,
    decodeClosingReceipt,
    decodeClosingView,
    type ClosingCapability,
    type ClosingCommandOptions,
    type ClosingProviderKeys,
    type ClosingReceipt,
    type ClosingSummarySettings,
    type ClosingView,
    type RequestClosingInput,
} from './closing-decoders';

export interface ClosingReadOptions {
    signal?: AbortSignal;
}

interface ClosingRetryOptions extends ClosingReadOptions, ClosingCommandOptions {}

const PROVIDER_KEY_HEADERS: Record<string, string> = {
    openrouter: 'X-Provider-Key-OpenRouter',
    gemini: 'X-Provider-Key-Gemini',
};

function providerKeyHeaders(keys?: ClosingProviderKeys): Record<string, string> | undefined {
    if (!keys) return undefined;
    const headers: Record<string, string> = {};
    for (const [provider, key] of Object.entries(keys)) {
        const header = PROVIDER_KEY_HEADERS[provider];
        if (header && key.trim()) {
            headers[header] = key.trim();
        }
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
}

function summarySettingsPayload(settings?: ClosingSummarySettings) {
    if (!settings) return undefined;
    return {
        provider: settings.provider ?? null,
        model: settings.model ?? null,
        temperature: settings.temperature ?? null,
        max_tokens: settings.maxTokens ?? null,
        base_url: settings.baseUrl ?? null,
    };
}

export const closingClient = {
    /** Admit one close intent (POST /meetings/:id/closing). */
    async request(
        meetingId: string,
        input: RequestClosingInput,
        options: ClosingCommandOptions = {}
    ): Promise<ClosingReceipt> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/closing`,
            {
                method: 'POST',
                headers: providerKeyHeaders(options.providerKeys),
                body: {
                    mode: input.mode,
                    request_key: input.requestKey,
                    summary_settings: summarySettingsPayload(input.summarySettings),
                },
                signal: input.signal,
            }
        );
        return decodeClosingReceipt(payload, 'POST /meetings/:id/closing');
    },

    /** Credential preflight; never starts work or carries a browser key. */
    async capability(
        meetingId: string,
        init: ClosingReadOptions = {}
    ): Promise<ClosingCapability> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/closing/capability`,
            { signal: init.signal }
        );
        return decodeClosingCapability(
            payload,
            'GET /meetings/:id/closing/capability'
        );
    },

    /** Canonical progress for one meeting; never starts work. */
    async get(meetingId: string, init: ClosingReadOptions = {}): Promise<ClosingView> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/closing`,
            { signal: init.signal }
        );
        return decodeClosingView(payload, 'GET /meetings/:id/closing');
    },

    /** Resume a recoverable failed close (POST /closing/retry). */
    async retry(
        meetingId: string,
        init: ClosingRetryOptions = {}
    ): Promise<ClosingView> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/closing/retry`,
            {
                method: 'POST',
                headers: providerKeyHeaders(init.providerKeys),
                signal: init.signal,
            }
        );
        return decodeClosingView(payload, 'POST /meetings/:id/closing/retry');
    },

    /** Abandon an open close and restore active admission (POST /closing/abort). */
    async abort(meetingId: string, init: ClosingReadOptions = {}): Promise<ClosingView> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/closing/abort`,
            { method: 'POST', signal: init.signal }
        );
        return decodeClosingView(payload, 'POST /meetings/:id/closing/abort');
    },
};
