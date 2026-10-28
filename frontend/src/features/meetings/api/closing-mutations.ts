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
import { closingClient, type RequestClosingInput } from './closing-client';
import type { ClosingReceipt, ClosingView } from './closing-decoders';
import { closingKeys } from './closing-keys';
import { meetingKeys } from './keys';
import { turnKeys } from './turn-keys';

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

function closingKey(runtime: MeetingsRuntime | undefined, meetingId: string) {
    return runtime?.keys.closing(meetingId) ?? closingKeys.detail(meetingId);
}

function meetingDetailKey(runtime: MeetingsRuntime | undefined, meetingId: string) {
    return runtime?.keys.meetingDetail(meetingId) ?? meetingKeys.detail(meetingId);
}

function meetingListKey(runtime: MeetingsRuntime | undefined) {
    return runtime?.keys.meetingList() ?? meetingKeys.list();
}

function turnListKey(runtime: MeetingsRuntime | undefined, meetingId: string) {
    return runtime?.keys.turnList(meetingId) ?? turnKeys.list(meetingId);
}

function refreshAfterStateChange(
    queryClient: ReturnType<typeof useQueryClient>,
    meetingId: string,
    runtime?: MeetingsRuntime
): void {
    void queryClient.invalidateQueries({
        queryKey: meetingDetailKey(runtime, meetingId),
    });
    void queryClient.invalidateQueries({ queryKey: meetingListKey(runtime) });
    void queryClient.invalidateQueries({
        queryKey: turnListKey(runtime, meetingId),
    });
}

export function useRequestClosing(runtime?: MeetingsRuntime) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ meetingId, ...input }: RequestClosingVariables) =>
            runtime
                ? runtime.commands.requestClosing(meetingId, {
                      ...input,
                      signal: combineSignals(runtime.signal, input.signal),
                  })
                : closingClient.request(meetingId, input),
        onSuccess: (_receipt: ClosingReceipt, variables: RequestClosingVariables) => {
            refreshAfterStateChange(queryClient, variables.meetingId, runtime);
            void queryClient.invalidateQueries({
                queryKey: closingKey(runtime, variables.meetingId),
            });
        },
    });
}

export function useRetryClosing(runtime?: MeetingsRuntime) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (meetingId: string) =>
            runtime
                ? runtime.commands.retryClosing(meetingId, runtime.signal)
                : closingClient.retry(meetingId),
        onSuccess: (view: ClosingView) => {
            queryClient.setQueryData(closingKey(runtime, view.meeting_id), view);
            refreshAfterStateChange(queryClient, view.meeting_id, runtime);
        },
    });
}

export function useAbortClosing(runtime?: MeetingsRuntime) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (meetingId: string) =>
            runtime
                ? runtime.commands.abortClosing(meetingId, runtime.signal)
                : closingClient.abort(meetingId),
        onSuccess: (view: ClosingView) => {
            queryClient.setQueryData(closingKey(runtime, view.meeting_id), view);
            refreshAfterStateChange(queryClient, view.meeting_id, runtime);
        },
    });
}
