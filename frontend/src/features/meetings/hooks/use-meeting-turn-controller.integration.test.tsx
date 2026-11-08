// @vitest-environment happy-dom
/**
 * Real controller + observer integration (spec 35 / T23).
 *
 * These tests deliberately do not mock `useTurnObservation` or the query
 * hooks. A lost stream must remain observable through the durable status
 * read, and the next queued operation must start only after settlement.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/app/providers';
import type { TurnOperation } from '../api/turn-decoders';
import {
    localObservationInterruption,
    type TurnEvent,
} from '../api/turn-events';
import { useTurnProjectionStore } from '../api/turn-projection';
import type { MeetingsRuntime } from '../runtime/contract';
import { createLiveMeetingsRuntime } from '../runtime/live';
import { useMeetingTurnController } from './use-meeting-turn-controller';

const meetingId = 'meeting-1';

function operation(overrides: Partial<TurnOperation> = {}): TurnOperation {
    return {
        operation_id: 'operation-1',
        meeting_id: meetingId,
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

function textEvent(operationId: string, content: string): TurnEvent {
    return {
        type: 'text',
        meetingId,
        operationId,
        eventId: `event-${operationId}-1`,
        sequence: 1,
        content,
    };
}

let queryClient: ReturnType<typeof makeQueryClient>;

function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    queryClient = makeQueryClient();
    useTurnProjectionStore.getState().reset({ meetingId, operationId: 'operation-1' });
    useTurnProjectionStore.getState().reset({ meetingId, operationId: 'operation-2' });
});

afterEach(() => {
    queryClient.clear();
});

describe('meeting turn controller and observer', () => {
    it('reconciles a lost stream from the status read before watching the next turn', async () => {
        const first = operation({ status: 'executing', queue_position: null });
        const second = operation({ operation_id: 'operation-2', admission: 2 });
        let listState: TurnOperation[] = [first];
        let detailState: TurnOperation = first;
        const observed: string[] = [];
        const onTerminal = vi.fn();
        const submit = vi.fn();

        const base = createLiveMeetingsRuntime();
        const runtime: MeetingsRuntime = {
            ...base,
            turns: {
                list: async () => listState,
                get: async () => detailState,
                observe: async function* (_meetingId: string, operationId: string) {
                    observed.push(operationId);
                    if (operationId === 'operation-1') {
                        yield textEvent('operation-1', 'Partial answer');
                        yield localObservationInterruption(1);
                        return;
                    }
                    yield textEvent('operation-2', 'Next answer');
                    yield localObservationInterruption(1);
                },
                submit,
                cancel: async () => ({ outcome: 'cancelled', status: 'cancelled' }),
            } as unknown as MeetingsRuntime['turns'],
        };

        const invalidations: unknown[] = [];
        const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
        queryClient.invalidateQueries = ((filters: { queryKey: unknown }) => {
            invalidations.push(filters.queryKey);
            return originalInvalidate(filters as never);
        }) as typeof queryClient.invalidateQueries;

        const { result } = renderHook(
            () =>
                useMeetingTurnController({
                    meetingId,
                    runtime,
                    onTerminal,
                }),
            { wrapper }
        );

        await waitFor(() =>
            expect(result.current.observationOperation?.operation_id).toBe('operation-1')
        );
        await waitFor(() =>
            expect(result.current.projection?.observationInterrupted).toBe(true)
        );
        expect(result.current.projection?.text).toBe('Partial answer');

        // This is the polling read that used to erase the watched identity:
        // the operation is now terminal, and a new one is queued behind it.
        detailState = operation({
            operation_id: 'operation-1',
            status: 'completed',
            queue_position: null,
            final_message_id: 'message-1',
        });
        listState = [
            detailState,
            operation({ operation_id: 'operation-2', admission: 2 }),
        ];
        await act(async () => {
            await queryClient.refetchQueries({
                queryKey: runtime.keys.turnList(meetingId),
            });
        });

        await waitFor(() => expect(onTerminal).toHaveBeenCalledTimes(1));
        expect(onTerminal.mock.calls[0]?.[1]).toBe('completed');
        expect(invalidations).toEqual(
            expect.arrayContaining([
                runtime.keys.meetingDetail(meetingId),
                runtime.keys.turnList(meetingId),
                runtime.keys.contextStats(meetingId),
                runtime.keys.disagreements(meetingId),
                runtime.keys.consensus(meetingId),
            ])
        );

        await waitFor(() => expect(observed).toContain('operation-2'));
        await waitFor(() => expect(result.current.projection?.text).toBe('Next answer'));
        expect(result.current.observationOperation?.operation_id).toBe('operation-2');
        expect(submit).not.toHaveBeenCalled();
    });

    it.each([
        [
            'failed',
            {
                type: 'error',
                meetingId,
                operationId: 'operation-1',
                eventId: 'event-error',
                sequence: 2,
                code: 'provider_error',
                message: 'Provider failed',
            } satisfies TurnEvent,
        ],
        [
            'cancelled',
            {
                type: 'cancelled',
                meetingId,
                operationId: 'operation-1',
                eventId: 'event-cancelled',
                sequence: 2,
            } satisfies TurnEvent,
        ],
    ])('settles a terminal %s event without installing a message', async (status, terminal) => {
        const first = operation({ status: 'executing', queue_position: null });
        const onTerminal = vi.fn();
        const base = createLiveMeetingsRuntime();
        const runtime: MeetingsRuntime = {
            ...base,
            turns: {
                list: async () => [first],
                get: async () => first,
                observe: async function* () {
                    yield textEvent('operation-1', 'Partial');
                    yield terminal;
                },
                submit: vi.fn(),
                cancel: async () => ({ outcome: 'cancelled', status: 'cancelled' }),
            } as unknown as MeetingsRuntime['turns'],
        };

        const { result } = renderHook(
            () =>
                useMeetingTurnController({
                    meetingId,
                    runtime,
                    onTerminal,
                }),
            { wrapper }
        );

        await waitFor(() => expect(onTerminal).toHaveBeenCalledTimes(1));
        expect(onTerminal.mock.calls[0]?.[1]).toBe(status);
        expect(result.current.projection?.finalMessageId ?? null).toBeNull();
        expect(result.current.observationOperation).toBeNull();
    });

    it('reattaches from the persisted sequence after a remount without submitting', async () => {
        const first = operation({ status: 'executing', queue_position: null });
        const afterCursors: number[] = [];
        const submit = vi.fn();
        const base = createLiveMeetingsRuntime();
        const runtime: MeetingsRuntime = {
            ...base,
            turns: {
                list: async () => [first],
                get: async () => first,
                observe: async function* (
                    _meetingId: string,
                    _operationId: string,
                    options?: { after?: number }
                ) {
                    afterCursors.push(options?.after ?? 0);
                    yield textEvent('operation-1', 'Resumed');
                    yield localObservationInterruption(1);
                },
                submit,
                cancel: async () => ({ outcome: 'cancelled', status: 'cancelled' }),
            } as unknown as MeetingsRuntime['turns'],
        };

        const { unmount } = renderHook(
            () =>
                useMeetingTurnController({
                    meetingId,
                    runtime,
                }),
            { wrapper }
        );

        await waitFor(() => expect(afterCursors).toEqual([0]));
        unmount();

        renderHook(
            () =>
                useMeetingTurnController({
                    meetingId,
                    runtime,
                }),
            { wrapper }
        );

        await waitFor(() => expect(afterCursors).toContain(1));
        expect(submit).not.toHaveBeenCalled();
    });

    it('settles a terminal event and a terminal poll race exactly once', async () => {
        const first = operation({ status: 'executing', queue_position: null });
        let listState: TurnOperation[] = [first];
        const onTerminal = vi.fn();
        const base = createLiveMeetingsRuntime();
        const runtime: MeetingsRuntime = {
            ...base,
            turns: {
                list: async () => listState,
                get: async () => listState[0]!,
                observe: async function* () {
                    yield textEvent('operation-1', 'Finished');
                    yield {
                        type: 'done',
                        meetingId,
                        operationId: 'operation-1',
                        eventId: 'event-done',
                        sequence: 2,
                        messageId: 'message-1',
                    } satisfies TurnEvent;
                },
                submit: vi.fn(),
                cancel: async () => ({ outcome: 'cancelled', status: 'cancelled' }),
            } as unknown as MeetingsRuntime['turns'],
        };

        const { result } = renderHook(
            () =>
                useMeetingTurnController({
                    meetingId,
                    runtime,
                    onTerminal,
                }),
            { wrapper }
        );

        await waitFor(() => expect(onTerminal).toHaveBeenCalledTimes(1));
        listState = [
            operation({
                operation_id: 'operation-1',
                status: 'completed',
                queue_position: null,
                final_message_id: 'message-1',
            }),
        ];
        await act(async () => {
            await queryClient.refetchQueries({
                queryKey: runtime.keys.turnList(meetingId),
            });
        });

        expect(onTerminal).toHaveBeenCalledTimes(1);
        expect(result.current.observationOperation).toBeNull();
    });
});
