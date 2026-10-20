/**
 * Durable turn operation decoding (spec-07).
 *
 * The API maps storage states to the public queued/executing/completed
 * vocabulary. The frontend must accept exactly that contract and reject
 * drifting statuses before they enter query caches.
 */
import { describe, expect, it } from 'vitest';
import { DecodeError } from '@/shared/api/decode';
import {
    decodeTurnCancelResult,
    decodeTurnOperation,
    decodeTurnOperationList,
    isTerminalTurnStatus,
} from './turn-decoders';

function operation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        operation_id: 'operation-1',
        meeting_id: 'meeting-1',
        participant_id: 'participant-1',
        request_key: 'request-1',
        status: 'queued',
        admission: 1,
        queue_position: 1,
        created_at: '2026-10-20T10:00:00Z',
        started_at: null,
        completed_at: null,
        final_message_id: null,
        cancel_requested: false,
        error: null,
        effective_generation: null,
        ...overrides,
    };
}

describe('decodeTurnOperation', () => {
    it('normalizes a queued operation without inventing timestamps or errors', () => {
        expect(decodeTurnOperation(operation(), 'turn')).toEqual({
            operation_id: 'operation-1',
            meeting_id: 'meeting-1',
            participant_id: 'participant-1',
            request_key: 'request-1',
            status: 'queued',
            admission: 1,
            queue_position: 1,
            created_at: '2026-10-20T10:00:00Z',
            started_at: null,
            completed_at: null,
            final_message_id: null,
            cancel_requested: false,
            error: null,
            effective_generation: null,
        });
    });

    it('decodes a terminal error and marks every terminal status', () => {
        const decoded = decodeTurnOperation(
            operation({
                status: 'interrupted',
                queue_position: null,
                error: {
                    code: 'credential_unavailable',
                    message: 'The queued turn needs its provider key again.',
                },
            }),
            'turn'
        );

        expect(decoded.status).toBe('interrupted');
        expect(decoded.error).toEqual({
            code: 'credential_unavailable',
            message: 'The queued turn needs its provider key again.',
        });
        expect(isTerminalTurnStatus(decoded.status)).toBe(true);
        expect(isTerminalTurnStatus('executing')).toBe(false);
    });

    it('rejects storage-only or unknown statuses', () => {
        expect(() => decodeTurnOperation(operation({ status: 'processing' }), 'turn')).toThrow(
            DecodeError
        );
    });

    it('decodes the list envelope item by item with path breadcrumbs', () => {
        expect(() =>
            decodeTurnOperationList([operation(), operation({ status: 'done' })], 'turns')
        ).toThrow(/turns\[1\]\.status/);
    });
});

describe('decodeTurnCancelResult', () => {
    it.each(['cancelled', 'cancel_requested', 'terminal'] as const)(
        'accepts the %s outcome and the mapped operation status',
        (outcome) => {
            expect(
                decodeTurnCancelResult({ outcome, status: 'cancelled' }, 'cancel')
            ).toEqual({ outcome, status: 'cancelled' });
        }
    );
});
