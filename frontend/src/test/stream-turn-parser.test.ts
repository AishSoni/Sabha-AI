/**
 * Contract for the streamTurn SSE parser (spec-02 C2).
 *
 * Evidence: the old parser dropped any event left in the buffer at EOF
 * (`if (done) break`), never tracked whether the stream ended with a terminal
 * (done/error) event, and could end a turn with no terminal at all — leaving
 * the UI streaming state stuck mid-air. These tests pin down:
 *
 * - arbitrary byte splits of lines/JSON parse correctly;
 * - the final unterminated event is flushed and delivered at EOF;
 * - a stream that ends without a terminal yields one synthesized
 *   "recovered interruption" error event (the store clears its own busy
 *   state; no automatic re-inference is attempted);
 * - malformed lines are skipped; events after a terminal are not replayed.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { api, StreamEvent } from '@/lib/api';

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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseWithChunks(chunks)));
    const events: StreamEvent[] = [];
    for await (const event of api.streamTurn('meeting-1', 'participant-1')) {
        events.push(event);
    }
    return events;
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('streamTurn SSE parsing', () => {
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

    it('surfaces non-ok responses as thrown errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                json: async () => ({ detail: 'boom' }),
            })
        );
        await expect(async () => {
            for await (const _ of api.streamTurn('meeting-1', 'participant-1')) {
                /* unreachable */
            }
        }).rejects.toThrow('boom');
    });
});
