/**
 * Durable turn event decoding (spec-07).
 *
 * Wire names stay snake_case like the rest of the frozen API. The normalized
 * domain event uses the camelCase contract from the spec, including stable
 * operation/event/tool identities. Observation is read-only: decoding and EOF
 * never submit or retry inference.
 */
import { ApiError, httpApiError, readFailureDetail } from '@/shared/api/errors';
import { DecodeError, decodeObject, requireNumber, requireString } from '@/shared/api/decode';

export type TurnEventType =
    | 'status'
    | 'text'
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'citation'
    | 'done'
    | 'error'
    | 'interrupted'
    | 'cancelled';

export interface TurnEvent {
    type: TurnEventType;
    meetingId: string;
    operationId: string;
    eventId: string;
    sequence: number;
    status?: string;
    queuePosition?: number;
    content?: string;
    invocationId?: string;
    callId?: string;
    toolName?: string;
    arguments?: Record<string, unknown>;
    result?: unknown;
    isError?: boolean;
    source?: string;
    title?: string;
    url?: string;
    snippet?: string;
    claimId?: string;
    locator?: string;
    documentId?: string;
    revisionId?: string;
    chunkId?: string;
    chunkIndex?: number;
    pageNumber?: number;
    messageId?: string;
    usage?: Record<string, number>;
    estimatedCost?: number;
    code?: string;
    message?: string;
}

const EVENT_TYPES: readonly TurnEventType[] = [
    'status',
    'text',
    'thinking',
    'tool_call',
    'tool_result',
    'citation',
    'done',
    'error',
    'interrupted',
    'cancelled',
];

const TERMINAL_EVENTS = new Set<TurnEventType>(['done', 'error', 'interrupted', 'cancelled']);

export function isTerminalTurnEvent(event: TurnEvent): boolean {
    return TERMINAL_EVENTS.has(event.type);
}

function optionalFieldString(
    record: Record<string, unknown>,
    key: string,
    path: string
): string | undefined {
    const value = record[key];
    if (value === null || value === undefined) return undefined;
    return requireString(value, `${path}.${key}`);
}

function optionalRecord(
    record: Record<string, unknown>,
    key: string,
    path: string
): Record<string, unknown> | undefined {
    const value = record[key];
    if (value === null || value === undefined) return undefined;
    return decodeObject(value, `${path}.${key}`);
}

export function decodeTurnEvent(value: unknown, path: string): TurnEvent {
    const record = decodeObject(value, path);
    const rawType = requireString(record.type, `${path}.type`);
    if (!(EVENT_TYPES as readonly string[]).includes(rawType)) {
        throw new DecodeError(`${path}.type: unsupported turn event ${rawType}`);
    }
    const type = rawType as TurnEventType;

    const event: TurnEvent = {
        type,
        meetingId: requireString(record.meeting_id, `${path}.meeting_id`),
        operationId: requireString(record.operation_id, `${path}.operation_id`),
        eventId: requireString(record.event_id, `${path}.event_id`),
        sequence: requireNumber(record.sequence, `${path}.sequence`),
    };

    const status = optionalFieldString(record, 'status', path);
    if (status !== undefined) event.status = status;
    if (typeof record.queue_position === 'number') event.queuePosition = record.queue_position;
    const content = optionalFieldString(record, 'content', path);
    if (content !== undefined) event.content = content;
    const invocationId = optionalFieldString(record, 'invocation_id', path);
    if (invocationId !== undefined) event.invocationId = invocationId;
    const callId = optionalFieldString(record, 'call_id', path);
    if (callId !== undefined) event.callId = callId;
    const toolName = optionalFieldString(record, 'tool_name', path);
    if (toolName !== undefined) event.toolName = toolName;
    const args = optionalRecord(record, 'arguments', path);
    if (args !== undefined) event.arguments = args;
    if (record.result !== undefined && record.result !== null) event.result = record.result;
    if (typeof record.is_error === 'boolean') event.isError = record.is_error;
    const source = optionalFieldString(record, 'source', path);
    if (source !== undefined) event.source = source;
    const title = optionalFieldString(record, 'title', path);
    if (title !== undefined) event.title = title;
    const url = optionalFieldString(record, 'url', path);
    if (url !== undefined) event.url = url;
    const snippet = optionalFieldString(record, 'snippet', path);
    if (snippet !== undefined) event.snippet = snippet;
    const claimId = optionalFieldString(record, 'claim_id', path);
    if (claimId !== undefined) event.claimId = claimId;
    const locator = optionalFieldString(record, 'locator', path);
    if (locator !== undefined) event.locator = locator;
    const documentId = optionalFieldString(record, 'document_id', path);
    if (documentId !== undefined) event.documentId = documentId;
    const revisionId = optionalFieldString(record, 'revision_id', path);
    if (revisionId !== undefined) event.revisionId = revisionId;
    const chunkId = optionalFieldString(record, 'chunk_id', path);
    if (chunkId !== undefined) event.chunkId = chunkId;
    if (typeof record.chunk_index === 'number') event.chunkIndex = record.chunk_index;
    if (typeof record.page_number === 'number') event.pageNumber = record.page_number;
    const messageId = optionalFieldString(record, 'message_id', path);
    if (messageId !== undefined) event.messageId = messageId;
    const usage = optionalRecord(record, 'usage', path);
    if (usage !== undefined) {
        event.usage = Object.fromEntries(
            Object.entries(usage).map(([key, raw]) => [
                key,
                typeof raw === 'number' ? raw : requireNumber(raw, `${path}.usage.${key}`),
            ])
        );
    }
    if (typeof record.estimated_cost === 'number') event.estimatedCost = record.estimated_cost;
    const code = optionalFieldString(record, 'code', path);
    if (code !== undefined) event.code = code;
    const message = optionalFieldString(record, 'message', path);
    if (message !== undefined) event.message = message;

    if (type === 'tool_call' && (!event.invocationId || !event.callId || !event.toolName)) {
        throw new DecodeError(`${path}: tool_call is missing invocation/call identity`);
    }
    if (type === 'tool_result' && (!event.invocationId || !event.callId)) {
        throw new DecodeError(`${path}: tool_result is missing invocation/call identity`);
    }
    return event;
}

export function toolIdentity(event: Pick<TurnEvent, 'operationId' | 'invocationId' | 'callId'>): string {
    return JSON.stringify([event.operationId, event.invocationId, event.callId]);
}

/**
 * Reads one observation response. The backend emits `data: {json}\n\n`, may
 * split frames at arbitrary byte boundaries, and closes after a terminal event.
 * An EOF without a terminal is an interrupted observation, never proof that
 * inference failed or should be retried.
 */
export async function* decodeTurnEventStream(
    response: Response
): AsyncGenerator<TurnEvent, void, unknown> {
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
    let lastSequence = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (!line.startsWith('data:')) continue;
                const json = line.slice(5).trim();
                if (!json) continue;
                const event = decodeTurnEvent(JSON.parse(json), 'turn event');
                if (event.sequence <= lastSequence) continue;
                lastSequence = event.sequence;
                if (sawTerminal) continue;
                if (isTerminalTurnEvent(event)) sawTerminal = true;
                yield event;
            }
        }
        buffer += decoder.decode();
        const leftover = buffer.trim();
        if (leftover.startsWith('data:')) {
            const json = leftover.slice(5).trim();
            if (json && !sawTerminal) {
                const event = decodeTurnEvent(JSON.parse(json), 'turn event');
                if (event.sequence > lastSequence) {
                    lastSequence = event.sequence;
                    if (isTerminalTurnEvent(event)) sawTerminal = true;
                    yield event;
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    if (!sawTerminal) {
        yield localObservationInterruption(lastSequence);
    }
}

/**
 * A client-local marker, never a persisted turn outcome. It says the stream
 * ended, not that the server-side operation was interrupted.
 */
export function localObservationInterruption(sequence = 0): TurnEvent {
    return {
        type: 'interrupted',
        meetingId: '',
        operationId: '',
        eventId: 'local-interruption',
        sequence,
        code: 'observation_interrupted',
        message: 'Observation ended before the turn reached a terminal event.',
    };
}

export function turnEventsPath(meetingId: string, operationId: string, after = 0): string {
    return (
        `/meetings/${encodeURIComponent(meetingId)}/turns/${encodeURIComponent(operationId)}/events` +
        `?after=${after}`
    );
}
