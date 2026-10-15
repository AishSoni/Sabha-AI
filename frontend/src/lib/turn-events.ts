/**
 * Turn stream events — typed v2 envelope, legacy adapter, SSE frame parser.
 *
 * CONTRACTS.md section 10 defines application stream version 2. The running
 * backend still emits legacy dicts (text/thinking/tool_call/tool_result/
 * citation/done/error), so this module parses SSE frames incrementally,
 * normalizes both shapes into one discriminated union, and deduplicates
 * replayed delivery by sequence. EOF without a terminal event means
 * connection loss, never successful completion.
 */

export type TurnTerminalKind = 'completed' | 'failed' | 'cancelled';

export type TurnStreamKind =
    | 'text_delta'
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'citation'
    | 'terminal'
    | 'error';

export interface TurnStreamEvent {
    kind: TurnStreamKind;
    /** Delivery sequence when the envelope carries one; assigned locally otherwise. */
    sequence: number;
    meetingId: string | null;
    turnId: string | null;
    segmentId: string | null;
    invocationIndex: number | null;
    content: string | null;
    toolExecutionId: string | null;
    providerCallId: string | null;
    toolName: string | null;
    toolArgs: Record<string, unknown> | null;
    toolResult: string | null;
    toolOutcome: string | null;
    terminalKind: TurnTerminalKind | null;
    messageId: string | null;
    errorMessage: string | null;
    retryable: boolean;
    raw: unknown;
}

export interface SseFrame {
    id: string | null;
    event: string | null;
    data: string | null;
}

const V2_TYPES: Record<string, TurnStreamKind> = {
    turn_started: 'terminal', // lifecycle marker, not content; mapped below
    text_delta: 'text_delta',
    tool_call: 'tool_call',
    tool_result: 'tool_result',
    citation: 'citation',
    turn_completed: 'terminal',
    turn_failed: 'terminal',
    turn_cancelled: 'terminal',
};

const V2_TERMINAL: Record<string, TurnTerminalKind> = {
    turn_completed: 'completed',
    turn_failed: 'failed',
    turn_cancelled: 'cancelled',
};

export interface NormalizeContext {
    meetingId: string;
    turnId: string | null;
    /** Monotonic fallback sequence for envelopes without one. */
    nextSequence: () => number;
    /** Stable fallback execution id for legacy tool calls without one. */
    nextExecutionId: (toolName: string) => string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

function asString(v: unknown): string | null {
    return typeof v === 'string' ? v : null;
}

/** Normalize one parsed SSE payload (v2 envelope or legacy dict). */
export function normalizeEvent(raw: unknown, ctx: NormalizeContext): TurnStreamEvent | null {
    if (!isRecord(raw)) return null;
    const base = {
        sequence: -1,
        meetingId: asString(raw.meeting_id) ?? ctx.meetingId,
        turnId: asString(raw.turn_id) ?? ctx.turnId,
        segmentId: null as string | null,
        invocationIndex: null as number | null,
        content: null as string | null,
        toolExecutionId: null as string | null,
        providerCallId: null as string | null,
        toolName: null as string | null,
        toolArgs: null as Record<string, unknown> | null,
        toolResult: null as string | null,
        toolOutcome: null as string | null,
        terminalKind: null as TurnTerminalKind | null,
        messageId: null as string | null,
        errorMessage: null as string | null,
        retryable: false,
        raw,
    };

    // Application stream version 2 envelope.
    if (raw.version === 2 && typeof raw.type === 'string' && raw.type in V2_TYPES) {
        const type = raw.type as string;
        const data = isRecord(raw.data) ? raw.data : {};
        if (typeof raw.sequence === 'number') base.sequence = raw.sequence;
        else base.sequence = ctx.nextSequence();
        if (typeof raw.session_generation === 'number') {
            // Generation fencing is applied by the store; parser preserves it.
        }
        if (asString(raw.turn_id)) base.turnId = asString(raw.turn_id);
        base.meetingId = asString(raw.meeting_id) ?? ctx.meetingId;

        if (type === 'turn_started') return null; // lifecycle marker, no UI content
        if (type === 'text_delta') {
            base.segmentId = asString(data.segment_id);
            base.invocationIndex = typeof data.invocation_index === 'number' ? data.invocation_index : null;
            base.content = asString(data.content) ?? '';
            return { ...base, kind: 'text_delta' };
        }
        if (type === 'tool_call') {
            base.toolExecutionId = asString(data.tool_execution_id);
            base.providerCallId = asString(data.provider_call_id);
            base.toolName = asString(data.tool_name);
            base.toolArgs = isRecord(data.arguments) ? (data.arguments as Record<string, unknown>) : null;
            return { ...base, kind: 'tool_call' };
        }
        if (type === 'tool_result') {
            base.toolExecutionId = asString(data.tool_execution_id);
            base.providerCallId = asString(data.provider_call_id);
            base.toolName = asString(data.tool_name);
            base.toolOutcome = asString(data.outcome);
            const result = data.result;
            base.toolResult = typeof result === 'string' ? result : result === undefined ? null : JSON.stringify(result);
            return { ...base, kind: 'tool_result' };
        }
        if (type === 'citation') {
            base.content = asString(data.snippet) ?? asString(data.title) ?? asString(data.source);
            return { ...base, kind: 'citation' };
        }
        // turn_completed / turn_failed / turn_cancelled
        base.terminalKind = V2_TERMINAL[type];
        base.messageId = asString(data.message_id) ?? asString(data.persisted_message_id);
        base.errorMessage = asString(data.message);
        base.retryable = data.retryable === true;
        return { ...base, kind: 'terminal' };
    }

    // Legacy backend dicts.
    if (typeof raw.type !== 'string') return null;
    base.sequence = ctx.nextSequence();
    switch (raw.type) {
        case 'text':
            base.content = asString(raw.content) ?? '';
            return { ...base, kind: 'text_delta' };
        case 'thinking':
            base.content = asString(raw.content) ?? '';
            return { ...base, kind: 'thinking' };
        case 'tool_call': {
            const name = asString(raw.tool_name) ?? 'tool';
            base.toolName = name;
            base.providerCallId = asString(raw.provider_call_id) ?? asString(raw.tool_call_id);
            base.toolExecutionId = base.providerCallId ?? ctx.nextExecutionId(name);
            base.toolArgs = isRecord(raw.tool_arguments) ? (raw.tool_arguments as Record<string, unknown>) : null;
            return { ...base, kind: 'tool_call' };
        }
        case 'tool_result': {
            const name = asString(raw.tool_name) ?? 'tool';
            base.toolName = name;
            base.providerCallId = asString(raw.provider_call_id) ?? asString(raw.tool_call_id);
            base.toolExecutionId = base.providerCallId ?? ctx.nextExecutionId(name);
            base.toolResult = asString(raw.tool_result) ?? asString(raw.result);
            base.toolOutcome = base.toolResult === null ? 'failed' : 'succeeded';
            return { ...base, kind: 'tool_result' };
        }
        case 'citation':
            base.content = asString(raw.snippet) ?? asString(raw.title) ?? asString(raw.source);
            return { ...base, kind: 'citation' };
        case 'done':
            base.terminalKind = 'completed';
            base.messageId = asString(raw.message_id);
            return { ...base, kind: 'terminal' };
        case 'error':
            base.errorMessage = asString(raw.content) ?? 'Streaming error';
            base.retryable = true; // transport-level; authoritative state decides
            return { ...base, kind: 'error' };
        default:
            return null; // unknown optional event: ignore, never crash
    }
}

export interface SseParserHandlers {
    onFrame: (frame: SseFrame) => void;
    onParseError?: (data: string, error: unknown) => void;
}

/**
 * Incremental SSE frame parser. Accepts strings or bytes (UTF-8 characters
 * may split across chunks), CRLF or LF, multiline data:, comment heartbeats
 * (ignored), and recovers from malformed JSON at the consumer layer.
 */
export function createSseParser(handlers: SseParserHandlers) {
    const decoder = new TextDecoder();
    let buffer = '';
    let pending: { id: string | null; event: string | null; data: string[] } | null = null;

    function ensurePending() {
        if (!pending) pending = { id: null, event: null, data: [] };
        return pending;
    }

    function dispatch() {
        const block = pending;
        pending = null;
        if (!block) return;
        const data = block.data.length > 0 ? block.data.join('\n') : null;
        // Pure heartbeat comment or empty block: nothing to deliver.
        if (data === null) return;
        handlers.onFrame({ id: block.id, event: block.event, data });
    }

    function processLine(line: string) {
        if (line === '') {
            dispatch();
            return;
        }
        if (line.startsWith(':')) return; // comment / heartbeat
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        const p = ensurePending();
        if (field === 'id') p.id = value;
        else if (field === 'event') p.event = value;
        else if (field === 'data') p.data.push(value);
        // Unknown fields are ignored per SSE spec.
    }

    return {
        feed(chunk: string | Uint8Array) {
            buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
            // Normalize CRLF so framing only deals with LF.
            buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            let idx: number;
            while ((idx = buffer.indexOf('\n')) !== -1) {
                processLine(buffer.slice(0, idx));
                buffer = buffer.slice(idx + 1);
            }
        },
        flush() {
            const tail = buffer + decoder.decode();
            buffer = '';
            if (tail !== '') processLine(tail);
            // A truncated tail without a blank-line terminator still dispatches
            // if it accumulated field data; connection loss itself is reported
            // by the subscriber, never implied as completion.
            if (pending && (pending.data.length > 0 || pending.id !== null || pending.event !== null)) {
                dispatch();
            }
            pending = null;
        },
    };
}

export type SseParser = ReturnType<typeof createSseParser>;

/** Delivery deduplication by turn sequence. Returns true when already seen. */
export function createSequenceDedup() {
    const seen = new Set<number>();
    return (sequence: number): boolean => {
        if (seen.has(sequence)) return true;
        seen.add(sequence);
        return false;
    };
}
