/**
 * Contract for the shared SSE stream decoder (spec-02 C2, extracted in spec-05).
 *
 * `decodeSseEvents` owns stream parsing independently of fetch: the caller
 * provides any `Response`, and the decoder reassembles frames across arbitrary
 * byte boundaries, tolerates malformed lines, delivers a final unterminated
 * event, and never replays events after a terminal. These tests pin down:
 *
 * - arbitrary byte splits of lines/JSON parse correctly;
 * - the final unterminated event is flushed and delivered at EOF;
 * - a stream that ends without a terminal yields one synthesized
 *   "recovered interruption" error event (the store clears its own busy
 *   state; no automatic re-inference is attempted);
 * - malformed lines are skipped; events after a terminal are not replayed;
 * - an aborted reader releases its observation resources and propagates the
 *   abort — it never claims the backend cancelled anything.
 */
import { describe, expect, it, vi } from 'vitest';
import { decodeSseEvents, StreamEvent } from '@/shared/api/sse';

function responseWithChunks(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const encoded = chunks.map(c => encoder.encode(c));
    let index = 0;
    const body = {
        getReader: () => ({
            read: async () => {
                if (index < encoded.length) {
                    return { done: false, value: encoded[index++] };
                }
                return { done: true, value: undefined };
            },
            releaseLock: () => {},
        }),
    };
    return { ok: true, status: 200, body } as unknown as Response;
}

const dataLine = (json: string) => `data: ${json}\n\n`;

async function collect(chunks: string[]): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    for await (const event of decodeSseEvents(responseWithChunks(chunks))) {
        events.push(event);
    }
    return events;
}

describe('decodeSseEvents envelope parsing', () => {
    it('reassembles events split across arbitrary byte boundaries', async () => {
        const stream =
            dataLine('{"type":"text","content":"hel"}') +
            dataLine('{"type":"text","content":"loe"}') +
            dataLine('{"type":"done","message_id":"m-1"}');

        // Cuts land inside JSON payloads and SSE framing, not line boundaries.
        const chunks = [
            stream.slice(0, 17),
            stream.slice(17, 40),
            stream.slice(40, 62),
            stream.slice(62),
        ];

        const events = await collect(chunks);

        expect(events.map(e => e.type)).toEqual(['text', 'text', 'done']);
        expect(events[0]!.content).toBe('hel');
        expect(events[1]!.content).toBe('loe');
    });

    it('flushes the final unterminated event at EOF', async () => {
        const events = await collect([
            dataLine('{"type":"text","content":"hi"}'),
            dataLine('{"type":"done","message_id":"m-1"}').trimEnd(), // no trailing newline
        ]);
        expect(events.map(e => e.type)).toEqual(['text', 'done']);
    });

    it('tolerates malformed lines mid-stream', async () => {
        const events = await collect([
            dataLine('{"type":"text","content":"ok"}'),
            'data: {not json}\n\n',
            dataLine('{"type":"done","message_id":"m-1"}'),
        ]);
        expect(events.map(e => e.type)).toEqual(['text', 'done']);
    });

    it('drops events that arrive after the terminal', async () => {
        const events = await collect([
            dataLine('{"type":"done","message_id":"m-1"}'),
            dataLine('{"type":"text","content":"late noise"}'),
        ]);
        expect(events).toHaveLength(1);
        expect(events[0]!.type).toBe('done');
    });

    it('synthesizes one interruption error when the stream ends without a terminal', async () => {
        const events = await collect([dataLine('{"type":"text","content":"partial"}')]);

        expect(events.map(e => e.type)).toEqual(['text', 'error']);
        const interruption = events[events.length - 1]!;
        expect(interruption.interrupted).toBe(true);
        expect(interruption.content).toMatch(/interrupted/i);
        expect(interruption.content).toMatch(/retry|continue|partial/i);
    });

    it('synthesizes the interruption error for a truncated terminal', async () => {
        const events = await collect([
            dataLine('{"type":"text","content":"partial"}'),
            'data: {"type":"done",', // connection dies mid-event
        ]);
        expect(events.map(e => e.type)).toEqual(['text', 'error']);
        expect(events[events.length - 1]!.interrupted).toBe(true);
    });

    it('does not synthesize an interruption after an error terminal', async () => {
        const events = await collect([
            dataLine('{"type":"text","content":"hi"}'),
            dataLine('{"type":"error","content":"provider exploded"}'),
        ]);
        expect(events.map(e => e.type)).toEqual(['text', 'error']);
        expect(events[1]!.interrupted).toBeUndefined();
        expect(events[1]!.content).toBe('provider exploded');
    });

    it('surfaces non-ok responses as thrown safe errors', async () => {
        const response = {
            ok: false,
            status: 500,
            json: async () => ({ detail: 'boom' }),
        } as unknown as Response;

        await expect(async () => {
            for await (const _ of decodeSseEvents(response)) {
                /* unreachable */
            }
        }).rejects.toThrow('boom');
    });

    it('releases the reader and propagates an aborted read without claiming backend cancellation', async () => {
        const releaseLock = vi.fn();
        const body = {
            getReader: () => ({
                read: async () => {
                    throw Object.assign(new Error('The operation was aborted'), {
                        name: 'AbortError',
                    });
                },
                releaseLock,
            }),
        };
        const response = { ok: true, status: 200, body } as unknown as Response;

        const seen: StreamEvent[] = [];
        await expect(async () => {
            for await (const event of decodeSseEvents(response)) {
                seen.push(event);
            }
        }).rejects.toMatchObject({ name: 'AbortError' });

        // The abort released observation resources (no lock leak), yielded the
        // pre-abort events, and produced NO synthesized interruption event —
        // cancellation is the caller's, not a backend verdict.
        expect(releaseLock).toHaveBeenCalled();
        expect(seen).toHaveLength(0);
    });
});
