'use client';

/**
 * Closing commands (spec-08, runtime-scoped spec-15).
 *
 * Every command is explicit user intent; automatic retries stay off so a
 * paid summary checkpoint is never replayed by the query library. The
 * request mutation refreshes canonical progress rather than guessing a
 * stage from the receipt. Retry and abort return the new snapshot directly
 * and also reopen admission/turn identity reads.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { combineSignals } from '@/shared/runtime/scope';
import type { MeetingsRuntime } from '../runtime/contract';
import type { RequestClosingInput } from './closing-decoders';
import type { ClosingReceipt, ClosingView } from './closing-decoders';

export interface RequestClosingVariables extends RequestClosingInput {
    meetingId: string;
}

export function createClosingRequestKey(): string {
    const withCrypto = globalThis.crypto as Crypto | undefined;
    if (withCrypto && typeof withCrypto.randomUUID === 'function') {
        return withCrypto.randomUUID();
    }
    return `closing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function refreshAfterStateChange(
    queryClient: ReturnType<typeof useQueryClient>,
    meetingId: string,
    runtime: MeetingsRuntime
): void {
    void queryClient.invalidateQueries({
        queryKey: runtime.keys.meetingDetail(meetingId),
    });
    void queryClient.invalidateQueries({ queryKey: runtime.keys.meetingList() });
    void queryClient.invalidateQueries({
        queryKey: runtime.keys.turnList(meetingId),
    });
}

export function useRequestClosing(runtime: MeetingsRuntime) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ meetingId, ...input }: RequestClosingVariables) =>
            runtime.commands.requestClosing(meetingId, {
                ...input,
                signal: combineSignals(runtime.signal, input.signal),
            }),
        onSuccess: (_receipt: ClosingReceipt, variables: RequestClosingVariables) => {
            refreshAfterStateChange(queryClient, variables.meetingId, runtime);
            void queryClient.invalidateQueries({
                queryKey: runtime.keys.closing(variables.meetingId),
            });
        },
    });
}

export function useRetryClosing(runtime: MeetingsRuntime) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (meetingId: string) =>
            runtime.commands.retryClosing(meetingId, runtime.signal),
        onSuccess: (view: ClosingView) => {
            queryClient.setQueryData(runtime.keys.closing(view.meeting_id), view);
            refreshAfterStateChange(queryClient, view.meeting_id, runtime);
        },
    });
}

export function useAbortClosing(runtime: MeetingsRuntime) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (meetingId: string) =>
            runtime.commands.abortClosing(meetingId, runtime.signal),
        onSuccess: (view: ClosingView) => {
            queryClient.setQueryData(runtime.keys.closing(view.meeting_id), view);
            refreshAfterStateChange(queryClient, view.meeting_id, runtime);
        },
    });
}
