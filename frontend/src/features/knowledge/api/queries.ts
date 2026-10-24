'use client';

/**
 * Server-state reads for Knowledge (spec-09).
 *
 * TanStack Query owns documents, operations, and stacks. Components never
 * mirror these records into local state, so a remount or refetch observes the
 * same durable identities instead of starting another upload.
 */
import { useQuery } from '@tanstack/react-query';
import { documentClient, type DocumentScope } from './client';
import { documentKeys, stackKeys } from './keys';
import { stackClient } from './stacks';

const TERMINAL_OPERATION_STATES = new Set(['ready', 'failed', 'revoked']);

export function useDocuments(scope: DocumentScope) {
    const hasScope = Boolean(scope.meetingId || scope.personaId || scope.stackId);
    return useQuery({
        queryKey: documentKeys.scope(scope),
        queryFn: ({ signal }) => documentClient.list(scope, { signal }),
        enabled: hasScope,
        staleTime: 5_000,
        refetchInterval: (query) => {
            const documents = query.state.data;
            return documents?.some(
                (document) => document.status === 'pending' || document.status === 'processing'
            )
                ? 2_000
                : false;
        },
    });
}

export function useDocumentOperation(operationId: string | null | undefined) {
    return useQuery({
        queryKey: documentKeys.operation(operationId ?? ''),
        queryFn: ({ signal }) => documentClient.getOperation(operationId!, { signal }),
        enabled: Boolean(operationId),
        refetchInterval: (query) => {
            const state = query.state.data?.state;
            return state && TERMINAL_OPERATION_STATES.has(state) ? false : 1_500;
        },
    });
}

export function useStacks(userId?: string) {
    return useQuery({
        queryKey: stackKeys.list(userId),
        queryFn: ({ signal }) => stackClient.list({ userId, signal }),
    });
}

export function useStack(stackId: string) {
    return useQuery({
        queryKey: stackKeys.detail(stackId),
        queryFn: ({ signal }) => stackClient.get(stackId, { signal }),
        enabled: Boolean(stackId),
    });
}
