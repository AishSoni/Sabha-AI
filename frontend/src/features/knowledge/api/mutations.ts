'use client';

/**
 * Command hooks for Knowledge (spec-09).
 *
 * Uploads are durable commands, never auto-retried: replaying bytes creates a
 * second operation. A failed file is retried by operation id, preserving the
 * document/operation/meeting identity.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentClient, type DocumentScope, type DocumentUploadInput } from './client';
import { documentKeys, stackKeys } from './keys';
import {
    stackClient,
    type KnowledgeStackInput,
    type KnowledgeStackUpdate,
} from './stacks';

function invalidateScope(
    queryClient: ReturnType<typeof useQueryClient>,
    scope: DocumentScope
): void {
    void queryClient.invalidateQueries({ queryKey: documentKeys.scope(scope) }).catch(() => undefined);
    if (scope.meetingId) {
        void queryClient
            .invalidateQueries({ queryKey: documentKeys.meeting(scope.meetingId) })
            .catch(() => undefined);
    }
}

export function useUploadDocument(scope: DocumentScope) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: DocumentUploadInput) => documentClient.upload(input),
        retry: false,
        onSuccess: (receipt) => {
            invalidateScope(queryClient, scope);
            if (receipt.operationId) {
                void queryClient
                    .invalidateQueries({ queryKey: documentKeys.operation(receipt.operationId) })
                    .catch(() => undefined);
            }
        },
    });
}

export function useUploadMeetingDocument() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, meetingId }: { file: File; meetingId: string }) =>
            documentClient.upload({ file, meetingId }),
        retry: false,
        onSuccess: (_data, variables) => {
            void queryClient
                .invalidateQueries({ queryKey: documentKeys.meeting(variables.meetingId) })
                .catch(() => undefined);
        },
    });
}

export function useRetryIngestion(scope: DocumentScope) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (operationId: string) => documentClient.retryOperation(operationId),
        retry: false,
        onSuccess: (receipt) => {
            invalidateScope(queryClient, scope);
            if (receipt.operationId) {
                void queryClient
                    .invalidateQueries({ queryKey: documentKeys.operation(receipt.operationId) })
                    .catch(() => undefined);
            }
        },
    });
}

export function useDeleteDocument(scope: DocumentScope) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (documentId: string) => documentClient.delete(documentId),
        retry: false,
        onSuccess: () => invalidateScope(queryClient, scope),
    });
}

export function useCreateStack() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: KnowledgeStackInput) => stackClient.create(input),
        retry: false,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: stackKeys.all }).catch(() => undefined);
        },
    });
}

export function useUpdateStack(stackId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: KnowledgeStackUpdate) => stackClient.update(stackId, input),
        retry: false,
        onSuccess: (stack) => {
            queryClient.setQueryData(stackKeys.detail(stack.id), stack);
            void queryClient.invalidateQueries({ queryKey: stackKeys.all }).catch(() => undefined);
        },
    });
}

export function useDeleteStack() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (stackId: string) => stackClient.delete(stackId),
        retry: false,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: stackKeys.all }).catch(() => undefined);
        },
    });
}
