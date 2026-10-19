/**
 * SSE stream decoding owned by the shared transport layer (spec-05).
 *
 * This module knows nothing about meetings, features, stores, or query keys.
 * It accepts any `Response` whose body is a newline-delimited `data:` stream
 * of JSON envelopes and yields the parsed stream events. Error classification
 * (safe `ApiError` values instead of auth-shaped redirects) comes from the
 * shared errors module so a failed stream behaves exactly like any other
 * no-sign-in request.
 *
 * Wire contract (pinned by tests/fixtures/sse-*.ts and
 * src/lib/stream-turn-parser.test.ts):
 * - each frame is `data: {json}` followed by a blank line;
 * - `done` and `error` are terminal events; exactly one ends a healthy stream;
 * - non-terminal events after a terminal are ignored (never replayed);
 * - JSON frames split across arbitrary byte boundaries reassemble;
 * - a final unterminated frame is still parsed and delivered at EOF;
 * - a malformed frame is skipped and logged, never fatal;
 * - an EOF without a terminal yields one synthesized "recovered interruption"
 *   error event — no automatic re-inference is attempted;
 * - an aborted reader propagates the abort (after releasing the lock); the
 *   decoder never claims the backend cancelled the turn.
 */
import { ApiError, httpApiError, readFailureDetail } from '@/shared/api/errors';

export interface StreamEvent {
    type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'citation' | 'done' | 'error';
    content?: string;
    tool_name?: string;
    tool_arguments?: Record<string, unknown>;
    tool_result?: string;
    tool_call_id?: string;
    source?: string;
    title?: string;
    url?: string;
    snippet?: string;
    message_id?: string;
    usage?: Record<string, number>;
    interrupted?: boolean; // client-only marker, synthesized below
}

export type StreamEventType = StreamEvent['type'];

const RECOVERED_INTERRUPTION_CONTENT =
    'The stream was interrupted before the turn completed. Any partial result may already be saved — retry when ready to continue.';

export async function* decodeSseEvents(
    response: Response
): AsyncGenerator<StreamEvent, void, unknown> {
    if (!response.ok) {
        throw httpApiError(response.status, await readFailureDetail(response));
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new ApiError('http', response.status, 'No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let sawTerminal = false;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);

                if (!line) continue;

                if (line.startsWith('data:')) {
                    const jsonStr = line.slice(5).trim();

                    if (jsonStr) {
                        try {
                            const event = JSON.parse(jsonStr) as StreamEvent;
                            if (event.type === 'done' || event.type === 'error') {
                                sawTerminal = true;
                            } else if (sawTerminal) {
                                console.warn(
                                    '[SSE] ignored post-terminal event',
                                    event.type
                                );
                                continue;
                            }

                            yield event;
                        } catch (e) {
                            console.error('[SSE Parse Error]', jsonStr.slice(0, 100), e);
                        }
                    }
                }
            }
        }
        buffer += decoder.decode();

        const leftover = buffer.trim();
        if (leftover.startsWith('data:')) {
            const jsonStr = leftover.slice(5).trim();

            if (jsonStr && !sawTerminal) {
                try {
                    const event = JSON.parse(jsonStr) as StreamEvent;
                    if (event.type === 'done' || event.type === 'error') {
                        sawTerminal = true;
                    }
                    yield event;
                } catch (e) {
                    console.error('[SSE Truncated Event]', jsonStr.slice(0, 100), e);
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    if (!sawTerminal) {
        yield {
            type: 'error',
            content: RECOVERED_INTERRUPTION_CONTENT,
            interrupted: true,
        } as StreamEvent;
    }
}
