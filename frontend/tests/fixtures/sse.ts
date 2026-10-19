/**
 * SSE wire fixtures for backend → frontend turn-stream envelopes (spec-03).
 *
 * The backend (app/services/streaming.py) writes each event as a
 * `data: {json}\n\n` frame. These builders produce that exact wire format so
 * transport-level tests can script byte-accurate streams, and every named
 * envelope is executed against `api.streamTurn` in sse-envelopes.test.ts to
 * stay executable evidence (not prose).
 *
 * Envelopes mirror the backend_to_frontend_events acceptance matrix:
 * arbitrary chunk splits, duplicate/replay delivery, streams dying before a
 * terminal, and repeated tool names distinguished only by id.
 */

/** A wire frame exactly as the backend emits it: `data: {json}\n\n`. */
export function sseFrame(json: string): string {
    return `data: ${json}\n\n`;
}

export function sseJson(expected: unknown): string {
    return sseFrame(JSON.stringify(expected));
}

/**
 * A Response shape for stream-consuming code: reads the queued string
 * chunks back as UTF-8 bytes through a ReadableStream-like reader.
 */
export function makeSseResponse(chunks: string[], status = 200): Response {
    const encoder = new TextEncoder();
    const encoded = chunks.map((chunk) => encoder.encode(chunk));
    let index = 0;
    const body = {
        getReader: () => ({
            read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
                if (index < encoded.length) {
                    return { done: false, value: encoded[index++] };
                }
                return { done: true, value: undefined };
            },
            releaseLock: () => {},
        }),
    };
    return { ok: status < 400, status, body } as unknown as Response;
}

/** Two text events whose bytes are cut mid-JSON and mid-frame, then a done terminal. */
export const SPLIT_TEXT_THEN_DONE: string[] = (() => {
    const wire = [
        sseJson({ type: "text", content: "hel" }),
        sseJson({ type: "text", content: "loe" }),
        sseJson({
            type: "done",
            message_id: "msg-fixed-1",
            usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
    ].join("");
    return [wire.slice(0, 17), wire.slice(17, 40), wire.slice(40, 62), wire.slice(62)];
})();

/** Any event may reach the transport more than once (retry/replay paths). */
export const DUPLICATE_REPLAY: string[] = [
    [
        sseJson({ type: "text", content: "dial" }),
        sseJson({ type: "text", content: "dial" }),
        sseJson({ type: "done", message_id: "msg-replayed-1" }),
    ].join(""),
];

/** A stream that dies before reaching any terminal event. */
export const EOF_WITHOUT_TERMINAL: string[] = [
    [
        sseFrame('{"type":"text","content":"partial"}'),
        // No frame termination and no terminal: the connection just ends.
    ].join("").replace(/\n\n$/, ""),
];

/** Two calls to the same tool name in one turn, distinguished only by call id. */
export const DUPLICATE_TOOL_NAMES: string[] = [
    [
        sseJson({
            type: "tool_call",
            tool_name: "search_knowledge_base",
            tool_arguments: { query: "first query" },
            tool_call_id: "call-first-1",
        }),
        sseJson({
            type: "tool_call",
            tool_name: "search_knowledge_base",
            tool_arguments: { query: "second query" },
            tool_call_id: "call-second-2",
        }),
        sseJson({
            type: "tool_result",
            tool_name: "search_knowledge_base",
            tool_result: "result for first",
            tool_call_id: "call-first-1",
        }),
        sseJson({
            type: "tool_result",
            tool_name: "search_knowledge_base",
            tool_result: "result for second",
            tool_call_id: "call-second-2",
        }),
        sseJson({ type: "done", message_id: "msg-tools-1" }),
    ].join(""),
];
