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
import type {
    ClosingProviderKeys,
    RequestClosingInput,
} from './closing-decoders';
import type { ClosingReceipt, ClosingView } from './closing-decoders';

export interface RequestClosingVariables extends RequestClosingInput {
    meetingId: string;
    /** Providers whose browser keys should be resolved at command time. */
    providersToResolve?: string[];
}

export type RetryClosingVariables =
    | string
    | {
          meetingId: string;
          providersToResolve?: string[];
      };

export interface ClosingCommandHooks {
    /**
     * Invoked inside the mutation, never stored in mutation variables. The
     * returned map exists only for the duration of the HTTP call.
     */
    resolveProviderKeys?: (providers: string[]) => ClosingProviderKeys;
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
    const capabilityKey = runtime.keys.closingCapability?.(meetingId);
    if (capabilityKey) {
        void queryClient.invalidateQueries({ queryKey: capabilityKey });
    }
}

export function useRequestClosing(
    runtime: MeetingsRuntime,
    hooks: ClosingCommandHooks = {}
) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            meetingId,
            providersToResolve,
            ...input
        }: RequestClosingVariables) => {
            const providerKeys = hooks.resolveProviderKeys?.(
                providersToResolve ?? []
            );
            return runtime.commands.requestClosing(
                meetingId,
                {
                    ...input,
                    signal: combineSignals(runtime.signal, input.signal),
                },
                { providerKeys }
            );
        },
        onSuccess: (_receipt: ClosingReceipt, variables: RequestClosingVariables) => {
            refreshAfterStateChange(queryClient, variables.meetingId, runtime);
            void queryClient.invalidateQueries({
                queryKey: runtime.keys.closing(variables.meetingId),
            });
        },
    });
}

export function useRetryClosing(
    runtime: MeetingsRuntime,
    hooks: ClosingCommandHooks = {}
) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (variables: RetryClosingVariables) => {
            const meetingId =
                typeof variables === 'string' ? variables : variables.meetingId;
            const providers =
                typeof variables === 'string'
                    ? []
                    : (variables.providersToResolve ?? []);
            const providerKeys = hooks.resolveProviderKeys?.(providers);
            return runtime.commands.retryClosing(meetingId, runtime.signal, {
                providerKeys,
            });
        },
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
