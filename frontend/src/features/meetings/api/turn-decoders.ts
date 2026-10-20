/**
 * Wire decoders for durable turn operations (spec-07).
 *
 * The generated OpenAPI bindings stay the compile-time source of truth. These
 * decoders add the runtime breadcrumb checks and normalize the database's
 * legacy status names at the boundary.
 */
import {
    DecodeError,
    decodeObject,
    optionalNumber,
    optionalString,
    requireArray,
    requireNumber,
    requireString,
} from '@/shared/api/decode';
import type { components } from '@/shared/api/generated';

export type TurnOperation = components['schemas']['TurnOperationResponse'];
export type TurnCancelResult = components['schemas']['TurnCancelResponse'];

const TURN_STATUSES = [
    'queued',
    'executing',
    'completed',
    'failed',
    'interrupted',
    'cancelled',
] as const;
export type TurnStatus = (typeof TURN_STATUSES)[number];

export function isTurnStatus(value: string): value is TurnStatus {
    return (TURN_STATUSES as readonly string[]).includes(value);
}

export function isTerminalTurnStatus(status: TurnStatus): boolean {
    return ['completed', 'failed', 'interrupted', 'cancelled'].includes(status);
}

function requireTurnStatus(value: unknown, path: string): TurnStatus {
    const raw = requireString(value, path);
    if (!(TURN_STATUSES as readonly string[]).includes(raw)) {
        throw new DecodeError(`${path}: expected one of ${TURN_STATUSES.join(', ')}`);
    }
    return raw as TurnStatus;
}

export function decodeTurnOperation(value: unknown, path: string): TurnOperation {
    const record = decodeObject(value, path);
    const errorRecord =
        record.error === null || record.error === undefined
            ? null
            : decodeObject(record.error, `${path}.error`);

    return {
        operation_id: requireString(record.operation_id, `${path}.operation_id`),
        meeting_id: requireString(record.meeting_id, `${path}.meeting_id`),
        participant_id: optionalString(record.participant_id, `${path}.participant_id`) ?? null,
        request_key: requireString(record.request_key, `${path}.request_key`),
        status: requireTurnStatus(record.status, `${path}.status`),
        admission: requireNumber(record.admission, `${path}.admission`),
        queue_position: optionalNumber(record.queue_position, `${path}.queue_position`) ?? null,
        created_at: requireString(record.created_at, `${path}.created_at`),
        started_at: optionalString(record.started_at, `${path}.started_at`) ?? null,
        completed_at: optionalString(record.completed_at, `${path}.completed_at`) ?? null,
        final_message_id: optionalString(record.final_message_id, `${path}.final_message_id`) ?? null,
        cancel_requested:
            typeof record.cancel_requested === 'boolean' ? record.cancel_requested : false,
        error: errorRecord
            ? {
                  code: requireString(errorRecord.code, `${path}.error.code`),
                  message: requireString(errorRecord.message, `${path}.error.message`),
              }
            : null,
        effective_generation:
            record.effective_generation === null || record.effective_generation === undefined
                ? null
                : (decodeObject(record.effective_generation, `${path}.effective_generation`) as Record<
                      string,
                      unknown
                  >),
    };
}

export function decodeTurnOperationList(value: unknown, path: string): TurnOperation[] {
    return requireArray(value, path, (item, childPath) => decodeTurnOperation(item, childPath));
}

export function decodeTurnCancelResult(value: unknown, path: string): TurnCancelResult {
    const record = decodeObject(value, path);
    const outcome = requireString(record.outcome, `${path}.outcome`);
    if (!['cancelled', 'cancel_requested', 'terminal'].includes(outcome)) {
        throw new DecodeError(`${path}.outcome: unexpected value ${outcome}`);
    }
    return {
        outcome: outcome as TurnCancelResult['outcome'],
        status: requireTurnStatus(record.status, `${path}.status`),
    };
}
