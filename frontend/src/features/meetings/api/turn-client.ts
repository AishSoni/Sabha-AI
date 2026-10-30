/**
 * Typed durable turn client (spec-07).
 *
 * Submit/cancel are commands; list/get/observe are reads. Observation is a
 * reconnecting SSE read over the persisted event log, never a second
 * execution path. The BYOK key rides `X-Provider-Key` only and never enters
 * the request body or any persisted payload.
 */
import { fetchLiveStream, requestLiveJson } from '@/shared/access';
import { transportApiError } from '@/shared/api/errors';
import {
    decodeTurnCancelResult,
    decodeTurnOperation,
    decodeTurnOperationList,
    type TurnCancelResult,
    type TurnOperation,
} from './turn-decoders';
import { decodeTurnEventStream, turnEventsPath, type TurnEvent } from './turn-events';

/**
 * Browser-composed generation settings. Mirrors the settings vault shape
 * without making this feature depend on the legacy store or facade.
 */
export interface TurnGenerationSettings {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    baseUrl?: string;
    apiKey?: string;
}

export interface TurnReadOptions {
    signal?: AbortSignal;
}

export interface SubmitTurnInput extends TurnReadOptions {
    participantId: string;
    requestKey: string;
    settings?: TurnGenerationSettings;
}

export interface ObserveTurnOptions extends TurnReadOptions {
    after?: number;
}

function providerOverrides(settings?: TurnGenerationSettings) {
    if (!settings) return undefined;
    return {
        provider: settings.provider ?? null,
        model: settings.model ?? null,
        temperature: settings.temperature ?? null,
        max_tokens: settings.maxTokens ?? null,
        base_url: settings.baseUrl ?? null,
    };
}

function turnHeaders(settings?: TurnGenerationSettings): Record<string, string> | undefined {
    const key = settings?.apiKey?.trim();
    return key ? { 'X-Provider-Key': key } : undefined;
}

export const turnClient = {
    /** Admit one logical turn (POST /meetings/:id/turns). */
    async submit(meetingId: string, input: SubmitTurnInput): Promise<TurnOperation> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/turns`,
            {
                method: 'POST',
                headers: turnHeaders(input.settings),
                body: {
                    participant_id: input.participantId,
                    request_key: input.requestKey,
                    provider: providerOverrides(input.settings),
                },
                signal: input.signal,
            }
        );
        return decodeTurnOperation(payload, 'POST /meetings/:id/turns');
    },

    /** Ordered queue plus recent terminal operations for one meeting. */
    async list(
        meetingId: string,
        limit = 100,
        init: TurnReadOptions = {}
    ): Promise<TurnOperation[]> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/turns`,
            { query: { limit }, signal: init.signal }
        );
        return decodeTurnOperationList(payload, 'GET /meetings/:id/turns');
    },

    /** Durable status read; never starts or resumes work. */
    async get(
        meetingId: string,
        operationId: string,
        init: TurnReadOptions = {}
    ): Promise<TurnOperation> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/turns/${encodeURIComponent(operationId)}`,
            { signal: init.signal }
        );
        return decodeTurnOperation(payload, 'GET /meetings/:id/turns/:operationId');
    },

    /** Cancel a queued turn or request cooperative cancellation. */
    async cancel(
        meetingId: string,
        operationId: string,
        init: TurnReadOptions = {}
    ): Promise<TurnCancelResult> {
        const payload = await requestLiveJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/turns/${encodeURIComponent(operationId)}/cancel`,
            { method: 'POST', signal: init.signal }
        );
        return decodeTurnCancelResult(payload, 'POST /meetings/:id/turns/:operationId/cancel');
    },

    /**
     * Replay persisted events after `after` and follow the operation to its
     * terminal event. Closing the iterator only closes this observation; the
     * server keeps executing.
     */
    async *observe(
        meetingId: string,
        operationId: string,
        options: ObserveTurnOptions = {}
    ): AsyncGenerator<TurnEvent, void, unknown> {
        let response: Response;
        try {
            response = await fetchLiveStream(
                turnEventsPath(meetingId, operationId, options.after ?? 0),
                { signal: options.signal }
            );
        } catch (cause) {
            throw transportApiError(cause);
        }
        yield* decodeTurnEventStream(response);
    },
};
