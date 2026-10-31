'use client';

/**
 * Durable turn reads (spec-07, runtime-scoped spec-14).
 *
 * Queue reads poll only while an operation is queued/executing; they are
 * reads, never execution triggers. Observation itself is owned by the
 * operation-scoped hook (see `use-turn-observation`), not by these queries.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { isTerminalTurnStatus, type TurnOperation } from './turn-decoders';
import type { MeetingsRuntime } from '../runtime/contract';
import { combineSignals } from '@/shared/runtime/scope';

const ACTIVE_QUEUE_POLL_MS = 4_000;

export function hasActiveTurns(operations: TurnOperation[] | undefined): boolean {
    return Boolean(operations?.some((operation) => !isTerminalTurnStatus(operation.status)));
}

export function useMeetingTurns(
    meetingId: string,
    enabled: boolean,
    runtime: MeetingsRuntime
): UseQueryResult<TurnOperation[], Error> {
    return useQuery({
        queryKey: runtime.keys.turnList(meetingId),
        queryFn: async ({ signal }) =>
            runtime.turns.list(
                meetingId,
                combineSignals(runtime.signal, signal)
            ),
        enabled: enabled && meetingId.length > 0,
        refetchInterval: (query) =>
            hasActiveTurns(query.state.data) ? ACTIVE_QUEUE_POLL_MS : false,
    });
}

export function useTurnOperation(
    meetingId: string,
    operationId: string,
    enabled: boolean,
    runtime: MeetingsRuntime
): UseQueryResult<TurnOperation, Error> {
    return useQuery({
        queryKey: runtime.keys.turnDetail(meetingId, operationId),
        queryFn: async ({ signal }) =>
            runtime.turns.get(
                meetingId,
                operationId,
                combineSignals(runtime.signal, signal)
            ),
        enabled: enabled && meetingId.length > 0 && operationId.length > 0,
        refetchInterval: (query) =>
            query.state.data && !isTerminalTurnStatus(query.state.data.status)
                ? ACTIVE_QUEUE_POLL_MS
                : false,
    });
}
