// @vitest-environment happy-dom
/**
 * Meeting turn controller (spec-07).
 *
 * The controller turns clicks into idempotent admissions, selects the one
 * active FIFO operation for observation, and keeps cancellation separate
 * from observation detach.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/shared/api/errors';
import type { TurnOperation } from '../api/turn-decoders';
import { useMeetingTurnController } from './use-meeting-turn-controller';

const mocks = vi.hoisted(() => ({
    turns: { data: [] as TurnOperation[], isLoading: false },
    submit: vi.fn(),
    cancel: vi.fn(),
    observe: {
        projection: undefined,
        isObserving: false,
        resume: vi.fn(),
    },
}));

vi.mock('../api/turn-queries', () => ({
    useMeetingTurns: () => mocks.turns,
}));

vi.mock('../api/turn-mutations', () => ({
    useSubmitTurn: () => ({
        mutateAsync: mocks.submit,
        isPending: false,
    }),
    useCancelTurn: () => ({
        mutateAsync: mocks.cancel,
    }),
}));

vi.mock('../api/use-turn-observation', () => ({
    useTurnObservation: () => mocks.observe,
}));

const operation = (overrides: Partial<TurnOperation> = {}): TurnOperation =>
    ({
        operation_id: 'operation-1',
        meeting_id: 'meeting-1',
        participant_id: 'participant-1',
        request_key: 'key-1',
        status: 'queued',
        admission: 1,
        queue_position: 1,
        created_at: '2026-10-22T10:00:00Z',
        started_at: null,
        completed_at: null,
        final_message_id: null,
        cancel_requested: false,
        error: null,
        effective_generation: null,
        ...overrides,
    }) as TurnOperation;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.turns.data = [];
    mocks.submit.mockReset();
    mocks.cancel.mockReset();
});

describe('meeting turn controller', () => {
    it('reuses the request key after an ambiguous network failure', async () => {
        const keys = ['key-1', 'key-2'];
        const createRequestKey = vi.fn(() => keys.shift() ?? 'key-fallback');
        mocks.submit
            .mockRejectedValueOnce(new ApiError('network', null, 'Network request failed'))
            .mockResolvedValueOnce(operation())
            .mockResolvedValueOnce(operation({ operation_id: 'operation-2' }));

        const { result } = renderHook(() =>
            useMeetingTurnController({ meetingId: 'meeting-1', createRequestKey })
        );

        await act(async () => {
            expect(await result.current.submit('participant-1')).toBeNull();
        });
        expect(result.current.actionError).toBe('Network request failed');

        await act(async () => {
            await result.current.submit('participant-1');
        });
        expect(mocks.submit.mock.calls[0]?.[0].requestKey).toBe('key-1');
        expect(mocks.submit.mock.calls[1]?.[0].requestKey).toBe('key-1');
        expect(createRequestKey).toHaveBeenCalledTimes(1);

        // A successful admission closes the intent; the next click is a new turn.
        await act(async () => {
            await result.current.submit('participant-1');
        });
        expect(mocks.submit.mock.calls[2]?.[0].requestKey).toBe('key-2');
    });

    it('drops the request key after a deterministic 4xx rejection', async () => {
        const createRequestKey = vi
            .fn()
            .mockReturnValueOnce('key-1')
            .mockReturnValueOnce('key-2');
        mocks.submit
            .mockRejectedValueOnce(new ApiError('http', 409, 'Payload changed'))
            .mockResolvedValueOnce(operation());

        const { result } = renderHook(() =>
            useMeetingTurnController({ meetingId: 'meeting-1', createRequestKey })
        );

        await act(async () => {
            await result.current.submit('participant-1');
        });
        await act(async () => {
            await result.current.submit('participant-1');
        });

        expect(mocks.submit.mock.calls[0]?.[0].requestKey).toBe('key-1');
        expect(mocks.submit.mock.calls[1]?.[0].requestKey).toBe('key-2');
    });

    it('selects the oldest active operation and exposes the waiting queue', () => {
        mocks.turns.data = [
            operation({ operation_id: 'executing', participant_id: 'participant-1', status: 'executing', queue_position: null }),
            operation({ admission: 2, operation_id: 'waiting', participant_id: 'participant-2' }),
            operation({
                admission: 3,
                operation_id: 'finished',
                participant_id: 'participant-3',
                status: 'completed',
                queue_position: null,
            }),
        ];

        const { result } = renderHook(() =>
            useMeetingTurnController({ meetingId: 'meeting-1' })
        );

        expect(result.current.activeOperation?.operation_id).toBe('executing');
        expect(result.current.activeParticipantId).toBe('participant-1');
        expect(result.current.queuedOperations.map((item) => item.operation_id)).toEqual([
            'waiting',
        ]);
    });

    it('keeps cancellation as its own command', async () => {
        mocks.cancel.mockResolvedValue({ outcome: 'cancel_requested', status: 'executing' });
        const { result } = renderHook(() =>
            useMeetingTurnController({ meetingId: 'meeting-1' })
        );

        await act(async () => {
            expect(await result.current.cancel('operation-1')).toBe(true);
        });

        await waitFor(() => expect(mocks.cancel).toHaveBeenCalledTimes(1));
        expect(mocks.cancel).toHaveBeenCalledWith({
            meetingId: 'meeting-1',
            operationId: 'operation-1',
        });
        expect(mocks.submit).not.toHaveBeenCalled();
    });
});
