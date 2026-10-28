/**
 * Recorded closing text decoding (spec-17).
 *
 * Closing text is a separate typed transport from turn events: it carries
 * ballot/summary identity, an ordered sequence, provisional/terminal state,
 * and never a participant turn. EOF leaves the last provisional text in place;
 * it does not fabricate completion.
 */
import { ApiError, httpApiError, readFailureDetail } from '@/shared/api/errors';
import {
    DecodeError,
    decodeObject,
    optionalString,
    requireBoolean,
    requireNumber,
    requireString,
} from '@/shared/api/decode';

export type ClosingTextEventKind = 'ballot' | 'summary';
export type ClosingTextEventResult = 'yes' | 'no' | 'no-vote' | 'completed';

export interface ClosingTextEvent {
    eventId: string;
    closingId: string;
    meetingId: string;
    itemId: string;
    kind: ClosingTextEventKind;
    sequence: number;
    text: string;
    provisional: boolean;
    terminal: boolean;
    result: ClosingTextEventResult | null;
    subjectId?: string;
    provenance: 'recorded-stream';
}

const KINDS: readonly ClosingTextEventKind[] = ['ballot', 'summary'];
const RESULTS: readonly ClosingTextEventResult[] = ['yes', 'no', 'no-vote', 'completed'];

function optionalResult(record: Record<string, unknown>, path: string): ClosingTextEventResult | null {
    const value = record.result;
    if (value === null || value === undefined) return null;
    const result = requireString(value, `${path}.result`);
    if (!(RESULTS as readonly string[]).includes(result)) {
        throw new DecodeError(`${path}.result: unsupported closing result ${result}`);
    }
    return result as ClosingTextEventResult;
}

export function decodeClosingTextEvent(value: unknown, path: string): ClosingTextEvent {
    const record = decodeObject(value, path);
    const kind = requireString(record.kind, `${path}.kind`);
    if (!(KINDS as readonly string[]).includes(kind)) {
        throw new DecodeError(`${path}.kind: unsupported closing text kind ${kind}`);
    }
    const provenance = requireString(record.provenance, `${path}.provenance`);
    if (provenance !== 'recorded-stream') {
        throw new DecodeError(`${path}.provenance: expected recorded-stream`);
    }
    const provisional = requireBoolean(record.provisional, `${path}.provisional`);
    const terminal = requireBoolean(record.terminal, `${path}.terminal`);
    if (provisional === terminal) {
        throw new DecodeError(`${path}: text must be exactly provisional or terminal`);
    }
    const event: ClosingTextEvent = {
        eventId: requireString(record.event_id, `${path}.event_id`),
        closingId: requireString(record.closing_id, `${path}.closing_id`),
        meetingId: requireString(record.meeting_id, `${path}.meeting_id`),
        itemId: requireString(record.item_id, `${path}.item_id`),
        kind: kind as ClosingTextEventKind,
        sequence: requireNumber(record.sequence, `${path}.sequence`),
        text: requireString(record.text, `${path}.text`),
        provisional,
        terminal,
        result: optionalResult(record, path),
        provenance: 'recorded-stream',
    };
    const subjectId = optionalString(record.subject_id, `${path}.subject_id`);
    if (subjectId !== undefined) event.subjectId = subjectId;
    if (terminal && event.result === null) {
        throw new DecodeError(`${path}: terminal text needs a result`);
    }
    return event;
}

export async function* decodeClosingTextStream(
    response: Response
): AsyncGenerator<ClosingTextEvent, void, unknown> {
    if (!response.ok) {
        throw httpApiError(response.status, await readFailureDetail(response));
    }
    const reader = response.body?.getReader();
    if (!reader) {
        throw new ApiError('http', response.status, 'No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
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
                const event = decodeClosingTextEvent(JSON.parse(json), 'closing event');
                if (event.sequence <= lastSequence) continue;
                lastSequence = event.sequence;
                yield event;
            }
        }
        buffer += decoder.decode();
        const leftover = buffer.trim();
        if (leftover.startsWith('data:')) {
            const json = leftover.slice(5).trim();
            if (json) {
                const event = decodeClosingTextEvent(JSON.parse(json), 'closing event');
                if (event.sequence > lastSequence) yield event;
            }
        }
    } finally {
        reader.releaseLock();
    }
}
