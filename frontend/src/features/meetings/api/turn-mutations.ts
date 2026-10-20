'use client';

/**
 * Durable turn commands (spec-07).
 *
 * Submission is idempotent by request key; retries stay off so a paid
 * operation is only ever replayed by explicit user intent. A successful
 * submission seeds the operation cache and refreshes the meeting queue.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { turnClient, type SubmitTurnInput } from './turn-client';
import type { TurnCancelResult, TurnOperation } from './turn-decoders';
import { turnKeys } from './turn-keys';

export interface SubmitTurnVariables extends SubmitTurnInput {
    meetingId: string;
}

export interface CancelTurnVariables {
    meetingId: string;
    operationId: string;
}

export function useSubmitTurn() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: SubmitTurnVariables) =>
            turnClient.submit(variables.meetingId, variables),
        onSuccess: (operation: TurnOperation) => {
            queryClient.setQueryData(
                turnKeys.detail(operation.meeting_id, operation.operation_id),
                operation
            );
            queryClient.setQueryData<TurnOperation[]>(
                turnKeys.list(operation.meeting_id),
                (existing = []) =>
                    existing.some((item) => item.operation_id === operation.operation_id)
                        ? existing.map((item) =>
                              item.operation_id === operation.operation_id ? operation : item
                          )
                        : [...existing, operation]
            );
            queryClient.invalidateQueries({ queryKey: turnKeys.list(operation.meeting_id) });
        },
    });
}

export function useCancelTurn() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ meetingId, operationId }: CancelTurnVariables) =>
            turnClient.cancel(meetingId, operationId),
        onSuccess: (_result: TurnCancelResult, variables: CancelTurnVariables) => {
            queryClient.invalidateQueries({
                queryKey: turnKeys.list(variables.meetingId),
            });
            queryClient.invalidateQueries({
                queryKey: turnKeys.detail(variables.meetingId, variables.operationId),
            });
        },
    });
}
