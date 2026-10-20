/**
 * Durable turn wire contract for the frontend (spec-07).
 *
 * These are executable versions of the actual backend observation contract:
 * snake_case payloads, arbitrary byte splits, sequence replay, stable tool
 * identities, and an EOF that means "observation interrupted", never
 * "retry the paid inference".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { makeSseResponse, sseFrame } from '../../../../tests/fixtures/sse';
import {
    decodeTurnEvent,
    decodeTurnEventStream,
    isTerminalTurnEvent,
    toolIdentity,
    turnEventsUrl,
    type TurnEvent,
} from './turn-events';

function wireEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        meeting_id: 'meeting-1',
        operation_id: 'operation-1',
        event_id: `event-${String(overrides.sequence ?? 1)}`,
        sequence: 1,
        ...overrides,
    };
}

async function collect(response: Response): Promise<TurnEvent[]> {
    const events: TurnEvent[] = [];
    for await (const event of decodeTurnEventStream(response)) {
        events.push(event);
    }
    return events;
}

afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
});

describe('decodeTurnEventStream', () => {
    it('decodes frames split at arbitrary byte boundaries and stops at the terminal event', async () => {
        const wire =
            sseFrame(JSON.stringify(wireEvent({ type: 'text', content: 'hel', sequence: 1 }))) +
            sseFrame(JSON.stringify(wireEvent({ type: 'text', content: 'lo', sequence: 2 }))) +
            sseFrame(
                JSON.stringify(
                    wireEvent({
                        type: 'done',
                        sequence: 3,
                        message_id: 'message-1',
                        usage: { prompt_tokens: 4, completion_tokens: 2 },
                        estimated_cost: 0.02,
                    })
                )
            );

        const events = await collect(
            makeSseResponse([wire.slice(0, 13), wire.slice(13, 47), wire.slice(47, 81), wire.slice(81)])
        );

        expect(events.map((event) => event.type)).toEqual(['text', 'text', 'done']);
        expect(events.map((event) => event.content)).toEqual(['hel', 'lo', undefined]);
        expect(events[2]).toMatchObject({
            sequence: 3,
            messageId: 'message-1',
            usage: { prompt_tokens: 4, completion_tokens: 2 },
            estimatedCost: 0.02,
        });
        expect(isTerminalTurnEvent(events[2]!)).toBe(true);
    });

    it('drops replayed sequences and anything after a terminal event', async () => {
        const response = makeSseResponse([
            sseFrame(JSON.stringify(wireEvent({ type: 'text', content: 'first', sequence: 1 }))),
            sseFrame(JSON.stringify(wireEvent({ type: 'text', content: 'replay', sequence: 1 }))),
            sseFrame(JSON.stringify(wireEvent({ type: 'done', sequence: 2 }))),
            sseFrame(JSON.stringify(wireEvent({ type: 'text', content: 'late', sequence: 3 }))),
        ]);

        const events = await collect(response);

        expect(events.map((event) => event.content)).toEqual(['first', undefined]);
        expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    });

    it('synthesizes an interrupted observation on EOF without a terminal and never retries', async () => {
        const events = await collect(
            makeSseResponse([
                sseFrame(JSON.stringify(wireEvent({ type: 'text', content: 'partial', sequence: 1 }))),
            ])
        );

        expect(events).toHaveLength(2);
        expect(events[0]?.content).toBe('partial');
        expect(events[1]).toMatchObject({
            type: 'interrupted',
            sequence: 1,
            eventId: 'local-interruption',
            code: 'observation_interrupted',
        });
    });

    it('keeps two same-name tool calls distinct by operation/invocation/call identity', async () => {
        const response = makeSseResponse([
            sseFrame(
                JSON.stringify(
                    wireEvent({
                        type: 'tool_call',
                        sequence: 1,
                        invocation_id: 'invocation-1',
                        call_id: 'call-a',
                        tool_name: 'search_knowledge_base',
                        arguments: { query: 'first' },
                    })
                )
            ),
            sseFrame(
                JSON.stringify(
                    wireEvent({
                        type: 'tool_call',
                        sequence: 2,
                        invocation_id: 'invocation-1',
                        call_id: 'call-b',
                        tool_name: 'search_knowledge_base',
                        arguments: { query: 'second' },
                    })
                )
            ),
            sseFrame(
                JSON.stringify(
                    wireEvent({
                        type: 'tool_result',
                        sequence: 3,
                        invocation_id: 'invocation-1',
                        call_id: 'call-b',
                        tool_name: 'search_knowledge_base',
                        result: 'second result',
                    })
                )
            ),
            sseFrame(JSON.stringify(wireEvent({ type: 'done', sequence: 4 }))),
        ]);

        const calls: TurnEvent[] = [];
        const results: TurnEvent[] = [];
        for await (const event of decodeTurnEventStream(response)) {
            if (event.type === 'tool_call') calls.push(event);
            if (event.type === 'tool_result') results.push(event);
        }

        expect(calls).toHaveLength(2);
        expect(toolIdentity(calls[0]!)).not.toBe(toolIdentity(calls[1]!));
        expect(toolIdentity(results[0]!)).toBe(toolIdentity(calls[1]!));
        expect(results[0]?.result).toBe('second result');
    });

    it('rejects a tool event without correlation identity', () => {
        expect(() =>
            decodeTurnEvent(
                wireEvent({
                    type: 'tool_call',
                    invocation_id: 'invocation-1',
                    tool_name: 'search_knowledge_base',
                }),
                'event'
            )
        ).toThrow(/invocation\/call identity/);
    });
});

describe('turnEventsUrl', () => {
    it('targets the durable observation route with the replay cursor encoded', () => {
        expect(turnEventsUrl('meeting 1', 'operation/2', 7)).toBe(
            'http://localhost:8000/api/meetings/meeting%201/turns/operation%2F2/events?after=7'
        );
    });
});
