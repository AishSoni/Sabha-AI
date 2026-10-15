// P07-TEST02: fragmented/replayed stream frames, v2 envelope mapping,
// legacy adapter identity, unknown-field tolerance.
import { describe, expect, it } from 'vitest';
import {
    createSequenceDedup,
    createSseParser,
    normalizeEvent,
    type NormalizeContext,
    type SseFrame,
    type TurnStreamEvent,
} from '@/lib/turn-events';
import { encodeSSE, splitBytes } from '@/test/sse';

function makeCtx(): NormalizeContext {
    let seq = 0;
    let tools = 0;
    return {
        meetingId: 'm1',
        turnId: 't1',
        nextSequence: () => ++seq,
        nextExecutionId: (name: string) => `legacy:t1:${name}:${++tools}`,
    };
}

function parseAll(payload: string | Uint8Array[], ctx = makeCtx()) {
    const frames: SseFrame[] = [];
    const parser = createSseParser({ onFrame: (f) => frames.push(f) });
    if (typeof payload === 'string') parser.feed(payload);
    else for (const c of payload) parser.feed(c);
    parser.flush();
    const events: TurnStreamEvent[] = [];
    for (const f of frames) {
        if (f.data === null) continue;
        const raw: unknown = JSON.parse(f.data);
        const e = normalizeEvent(raw, ctx);
        if (e) events.push(e);
    }
    return { frames, events };
}

describe('P07-TEST02 SSE framing and event normalization', () => {
    it('reassembles UTF-8 split across byte chunks with CRLF framing', () => {
        const payload = encodeSSE([{ type: 'text', content: 'héllo wörld ✓' }]).replaceAll('\n', '\r\n');
        const bytes = new TextEncoder().encode(payload);
        const chunks = [bytes.slice(0, 9), bytes.slice(9, 11), bytes.slice(11)];
        const { events } = parseAll(chunks);
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe('text_delta');
        expect(events[0].content).toBe('héllo wörld ✓');
    });

    it('joins multiline data: lines before dispatching one JSON payload', () => {
        const pretty = JSON.stringify({ type: 'text', content: 'multi' }, null, 2);
        const framed = pretty.split('\n').map((l) => `data: ${l}`).join('\n') + '\n\n';
        const { events } = parseAll(framed);
        expect(events).toHaveLength(1);
        expect(events[0].content).toBe('multi');
    });

    it('ignores comment heartbeats and unknown fields without crashing', () => {
        const payload = `: heartbeat\n\ndata: {"type":"text","content":"ok","future_field":{"x":1}}\n\n:hb\n\n`;
        const { events } = parseAll(payload);
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe('text_delta');
    });

    it('maps v2 envelopes with sequence and execution identity', () => {
        const v2 = {
            version: 2, event_id: 't1:3', sequence: 3, meeting_id: 'm1', turn_id: 't1',
            session_generation: 1, type: 'tool_result',
            data: { tool_execution_id: 'ex-1', provider_call_id: 'call-1', tool_name: 'search_knowledge_base', outcome: 'succeeded', result: { items: [] } },
        };
        const { events } = parseAll(encodeSSE([v2 as never]));
        expect(events).toHaveLength(1);
        expect(events[0].sequence).toBe(3);
        expect(events[0].toolExecutionId).toBe('ex-1');
        expect(events[0].providerCallId).toBe('call-1');
    });

    it('gives same-name legacy tool calls distinct execution ids', () => {
        const payload = encodeSSE([
            { type: 'tool_call', tool_name: 'search_knowledge_base' },
            { type: 'tool_call', tool_name: 'search_knowledge_base' },
        ]);
        const { events } = parseAll(payload);
        expect(events).toHaveLength(2);
        expect(events[0].toolExecutionId).not.toBe(events[1].toolExecutionId);
    });

    it('deduplicates replayed sequences', () => {
        const seen = createSequenceDedup();
        expect(seen(7)).toBe(false);
        expect(seen(7)).toBe(true);
        expect(seen(8)).toBe(false);
    });

    it('splitBytes helper still cuts inside multibyte characters', () => {
        const raw = `data: {"type":"text","content":"✓ ok"}\n\n`;
        const chunks = splitBytes(raw, [10, 25]);
        const { events } = parseAll(chunks);
        expect(events.map((e) => e.content)).toEqual(['✓ ok']);
    });
});
