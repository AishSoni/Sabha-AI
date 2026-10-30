'use client';

/**
 * Durable turn commands (spec-07, runtime-scoped spec-14).
 *
 * Submission is idempotent by request key; retries stay off so a paid
 * operation is only ever replayed by explicit user intent. A successful
 * submission seeds the operation cache and refreshes the meeting queue.
 * Recorded runtimes reject these intents before any request.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubmitTurnInput } from './turn-inputs';
import type { TurnCancelResult, TurnOperation } from './turn-decoders';
import { turnKeys } from './turn-keys';
import type { MeetingsRuntime } from '../runtime/contract';

async function liveTurnClient() {
    return (await import('./turn-client')).turnClient;
}

export interface SubmitTurnVariables extends SubmitTurnInput {
    meetingId: string;
}

export interface CancelTurnVariables {
    meetingId: string;
    operationId: string;
}

export function useSubmitTurn(runtime?: MeetingsRuntime) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (variables: SubmitTurnVariables) => {
            if (runtime) {
                return runtime.turns.submit(variables.meetingId, variables);
            }
            return (await liveTurnClient()).submit(variables.meetingId, variables);
        },
        onSuccess: (operation: TurnOperation) => {
            const detailKey =
                runtime?.keys.turnDetail(operation.meeting_id, operation.operation_id) ??
                turnKeys.detail(operation.meeting_id, operation.operation_id);
            const listKey =
                runtime?.keys.turnList(operation.meeting_id) ??
                turnKeys.list(operation.meeting_id);
            queryClient.setQueryData(detailKey, operation);
            queryClient.setQueryData<TurnOperation[]>(
                listKey,
                (existing = []) =>
                    existing.some((item) => item.operation_id === operation.operation_id)
                        ? existing.map((item) =>
                              item.operation_id === operation.operation_id ? operation : item
                          )
                        : [...existing, operation]
            );
            queryClient.invalidateQueries({ queryKey: listKey });
        },
    });
}

export function useCancelTurn(runtime?: MeetingsRuntime) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ meetingId, operationId }: CancelTurnVariables) => {
            if (runtime) {
                return runtime.turns.cancel(meetingId, operationId, runtime.signal);
            }
            return (await liveTurnClient()).cancel(meetingId, operationId);
        },
        onSuccess: (_result: TurnCancelResult, variables: CancelTurnVariables) => {
            queryClient.invalidateQueries({
                queryKey:
                    runtime?.keys.turnList(variables.meetingId) ??
                    turnKeys.list(variables.meetingId),
            });
            queryClient.invalidateQueries({
                queryKey:
                    runtime?.keys.turnDetail(
                        variables.meetingId,
                        variables.operationId
                    ) ?? turnKeys.detail(variables.meetingId, variables.operationId),
            });
        },
    });
}
