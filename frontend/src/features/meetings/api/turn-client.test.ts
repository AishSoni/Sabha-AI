/**
 * Durable turn client contract (spec-07).
 *
 * Commands use the shared JSON transport and BYOK header, while observation
 * dials the replayable event route directly. No client method may submit
 * inference as a side effect of reading status or events.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { createScriptedFetch, type ScriptedFetch } from '../../../../tests/fixtures/transport';
import { makeSseResponse, sseFrame } from '../../../../tests/fixtures/sse';
import { turnClient } from './turn-client';

function operation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        operation_id: 'operation-1',
        meeting_id: 'meeting-1',
        participant_id: 'participant-1',
        request_key: 'request-1',
        status: 'queued',
        admission: 1,
        queue_position: 1,
        created_at: '2026-10-20T10:00:00Z',
        started_at: null,
        completed_at: null,
        final_message_id: null,
        cancel_requested: false,
        error: null,
        effective_generation: null,
        ...overrides,
    };
}

let fetcher: ScriptedFetch;

beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    fetcher = createScriptedFetch();
    fetcher.install();
});

afterEach(() => {
    fetcher.reset();
    vi.unstubAllGlobals();
});

describe('turnClient commands', () => {
    it('submits a turn with a stable request key and keeps the BYOK key in the header only', async () => {
        fetcher.enqueueJson(202, operation());

        const submitted = await turnClient.submit('meeting-1', {
            participantId: 'participant-1',
            requestKey: 'request-1',
            settings: {
                provider: 'openrouter',
                model: 'test/model',
                temperature: 0.4,
                maxTokens: 512,
                apiKey: 'sk-secret',
            },
        });

        expect(submitted.operation_id).toBe('operation-1');
        expect(fetcher.calls).toHaveLength(1);
        expect(fetcher.calls[0]?.input).toBe('http://localhost:8000/api/meetings/meeting-1/turns');
        expect(fetcher.calls[0]?.init?.method).toBe('POST');
        expect(fetcher.calls[0]?.init?.headers).toEqual({
            'X-Provider-Key': 'sk-secret',
            'Content-Type': 'application/json',
        });
        const body = JSON.parse(String(fetcher.calls[0]?.init?.body));
        expect(body).toEqual({
            participant_id: 'participant-1',
            request_key: 'request-1',
            provider: {
                provider: 'openrouter',
                model: 'test/model',
                temperature: 0.4,
                max_tokens: 512,
                base_url: null,
            },
        });
        expect(JSON.stringify(body)).not.toContain('sk-secret');
    });

    it('cancels through the operation-scoped route and decodes the outcome', async () => {
        fetcher.enqueueJson(200, { outcome: 'cancel_requested', status: 'executing' });

        const result = await turnClient.cancel('meeting-1', 'operation-1');

        expect(result).toEqual({ outcome: 'cancel_requested', status: 'executing' });
        expect(fetcher.calls[0]?.input).toBe(
            'http://localhost:8000/api/meetings/meeting-1/turns/operation-1/cancel'
        );
        expect(fetcher.calls[0]?.init?.method).toBe('POST');
    });

    it('lists and reads operations without issuing a command', async () => {
        fetcher.enqueueJson(200, [operation()]);
        fetcher.enqueueJson(200, operation({ status: 'completed' }));

        const listed = await turnClient.list('meeting-1', 25);
        const read = await turnClient.get('meeting-1', 'operation-1');

        expect(listed.map((item) => item.status)).toEqual(['queued']);
        expect(read.status).toBe('completed');
        expect(fetcher.calls[0]?.input).toBe(
            'http://localhost:8000/api/meetings/meeting-1/turns?limit=25'
        );
        expect(fetcher.calls[1]?.init?.method).toBe('GET');
    });
});

describe('turnClient.observe', () => {
    it('replays from the requested cursor and yields normalized events', async () => {
        const response = makeSseResponse([
            sseFrame(
                JSON.stringify({
                    type: 'text',
                    meeting_id: 'meeting-1',
                    operation_id: 'operation-1',
                    event_id: 'event-5',
                    sequence: 5,
                    content: 'hello',
                })
            ),
            sseFrame(
                JSON.stringify({
                    type: 'done',
                    meeting_id: 'meeting-1',
                    operation_id: 'operation-1',
                    event_id: 'event-6',
                    sequence: 6,
                    message_id: 'message-1',
                })
            ),
        ]);
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => response)
        );

        const events = [];
        for await (const event of turnClient.observe('meeting-1', 'operation-1', { after: 4 })) {
            events.push(event);
        }

        expect(events.map((event) => event.type)).toEqual(['text', 'done']);
        expect(events[1]?.messageId).toBe('message-1');
        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:8000/api/meetings/meeting-1/turns/operation-1/events?after=4',
            expect.objectContaining({
                headers: { Accept: 'text/event-stream' },
            })
        );
    });

    it('maps a failed observation dial to a structured network error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('connection refused');
            })
        );

        const failure = await (async () => {
            for await (const _event of turnClient.observe('meeting-1', 'operation-1')) {
                // unreachable
            }
        })().catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ApiError);
        expect((failure as ApiError).kind).toBe('network');
    });
});
