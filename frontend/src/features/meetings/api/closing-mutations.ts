'use client';

/**
 * Closing commands (spec-08).
 *
 * Every command is explicit user intent; automatic retries stay off so a
 * paid summary checkpoint is never replayed by the query library. The
 * request mutation refreshes canonical progress rather than guessing a
 * stage from the receipt. Retry and abort return the new snapshot directly
 * and also reopen admission/turn identity reads.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

function refreshAfterStateChange(
    queryClient: ReturnType<typeof useQueryClient>,
    meetingId: string
): void {
    queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) });
    queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    queryClient.invalidateQueries({ queryKey: turnKeys.list(meetingId) });
}

export function useRequestClosing() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ meetingId, ...input }: RequestClosingVariables) =>
            closingClient.request(meetingId, input),
        onSuccess: (_receipt: ClosingReceipt, variables: RequestClosingVariables) => {
            refreshAfterStateChange(queryClient, variables.meetingId);
            queryClient.invalidateQueries({
                queryKey: closingKeys.detail(variables.meetingId),
            });
        },
    });
}

export function useRetryClosing() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (meetingId: string) => closingClient.retry(meetingId),
        onSuccess: (view: ClosingView) => {
            queryClient.setQueryData(closingKeys.detail(view.meeting_id), view);
            refreshAfterStateChange(queryClient, view.meeting_id);
        },
    });
}

export function useAbortClosing() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (meetingId: string) => closingClient.abort(meetingId),
        onSuccess: (view: ClosingView) => {
            queryClient.setQueryData(closingKeys.detail(view.meeting_id), view);
            refreshAfterStateChange(queryClient, view.meeting_id);
        },
    });
}
