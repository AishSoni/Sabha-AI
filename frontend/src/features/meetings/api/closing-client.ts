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
    decodeClosingReceipt,
    decodeClosingView,
    type ClosingMode,
    type ClosingReceipt,
    type ClosingView,
} from './closing-decoders';

export interface ClosingSummarySettings {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    baseUrl?: string;
}

export interface RequestClosingInput {
    mode: ClosingMode;
    /** Stable per user intent; a replay must reuse it. */
    requestKey: string;
    summarySettings?: ClosingSummarySettings;
    signal?: AbortSignal;
}

export interface ClosingReadOptions {
    signal?: AbortSignal;
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
        input: RequestClosingInput
    ): Promise<ClosingReceipt> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/closing`,
            {
                method: 'POST',
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

    /** Canonical progress for one meeting; never starts work. */
    async get(meetingId: string, init: ClosingReadOptions = {}): Promise<ClosingView> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/closing`,
            { signal: init.signal }
        );
        return decodeClosingView(payload, 'GET /meetings/:id/closing');
    },

    /** Resume a recoverable failed close (POST /closing/retry). */
    async retry(meetingId: string, init: ClosingReadOptions = {}): Promise<ClosingView> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/closing/retry`,
            { method: 'POST', signal: init.signal }
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
