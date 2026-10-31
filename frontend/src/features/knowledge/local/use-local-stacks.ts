"use client";

/**
 * Local practice stack registry (spec-25).
 *
 * The same registry drives stack routes, persona assignments, and practice
 * document scopes. Live stack adapters remain separate.
 */
import { useCallback, useMemo, useState } from "react";
import { useDemoWorkspace } from "@/features/demo-workspace/provider";
import type { WorkspaceStack } from "@/features/demo-workspace/contract";
import type { KnowledgeStackView } from "../presentation/contract";
import {
    assignedPersonas,
    createLocalStack,
    deleteLocalStack,
    stackDocumentCounts,
    updateLocalStack,
    type StackMutationFailure,
} from "./stack-state";

function localId(prefix: string): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
        return `${prefix}-${cryptoApi.randomUUID()}`;
    }
    return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function failureMessage(reason: StackMutationFailure): string {
    switch (reason) {
        case "not_found":
            return "This stack is no longer available.";
        case "invalid_name":
            return "A stack name is required and must be 100 characters or fewer.";
        case "limit_reached":
            return "This workspace reached its stack limit. Delete a stack or reset the demo.";
    }
}

export interface LocalStacksAdapter {
    stacks: KnowledgeStackView[];
    isLoading: boolean;
    isError: boolean;
    error: string | null;
    pending: boolean;
    getStack: (stackId: string) => KnowledgeStackView | null;
    getStackRecord: (stackId: string) => WorkspaceStack | null;
    createStack: (input: {
        name: string;
        description: string;
    }) => Promise<{ ok: true; stackId: string } | { ok: false; error: string }>;
    updateStack: (
        stackId: string,
        input: { name: string; description: string }
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
    deleteStack: (stackId: string) => void;
}

export function useLocalStacks(): LocalStacksAdapter {
    const workspace = useDemoWorkspace();
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const stacks = useMemo<KnowledgeStackView[]>(
        () =>
            workspace.local.stacks.map((stack) => {
                const counts = stackDocumentCounts(workspace.local, stack.stackId);
                return {
                    id: stack.stackId,
                    name: stack.label,
                    description: stack.description,
                    documentCount: counts.total,
                    readyCount: counts.ready,
                    assignedParticipantNames: assignedPersonas(
                        workspace.local,
                        stack.stackId
                    ),
                    scope: stack.scope,
                };
            }),
        [workspace.local]
    );

    const getStack = useCallback(
        (stackId: string) =>
            stacks.find((stack) => stack.id === stackId) ?? null,
        [stacks]
    );

    const getStackRecord = useCallback(
        (stackId: string) =>
            workspace.local.stacks.find((stack) => stack.stackId === stackId) ??
            null,
        [workspace.local.stacks]
    );

    const createStack = useCallback(
        async (input: { name: string; description: string }) => {
            setError(null);
            setPending(true);
            let failure: StackMutationFailure | null = null;
            let stackId: string | null = null;
            const outcome = workspace.commitLocal((current) => {
                const result = createLocalStack(current, {
                    stackId: localId("practice-stack"),
                    ...input,
                });
                if (!result.ok) {
                    failure = result.reason;
                    return current;
                }
                stackId = result.stack.stackId;
                return result.state;
            });
            setPending(false);
            if (!outcome.ok) {
                const message = outcome.message;
                setError(message);
                return { ok: false as const, error: message };
            }
            if (failure || !stackId) {
                const message = failureMessage(
                    failure ?? "not_found"
                );
                setError(message);
                return { ok: false as const, error: message };
            }
            return { ok: true as const, stackId };
        },
        [workspace]
    );

    const updateStack = useCallback(
        async (
            stackId: string,
            input: { name: string; description: string }
        ) => {
            setError(null);
            setPending(true);
            let failure: StackMutationFailure | null = null;
            const outcome = workspace.commitLocal((current) => {
                const result = updateLocalStack(current, stackId, input);
                if (!result.ok) {
                    failure = result.reason;
                    return current;
                }
                return result.state;
            });
            setPending(false);
            if (!outcome.ok) {
                const message = outcome.message;
                setError(message);
                return { ok: false as const, error: message };
            }
            if (failure) {
                const message = failureMessage(failure);
                setError(message);
                return { ok: false as const, error: message };
            }
            return { ok: true as const };
        },
        [workspace]
    );

    const deleteStack = useCallback(
        (stackId: string) => {
            setError(null);
            workspace.commitLocal((current) =>
                deleteLocalStack(current, stackId)
            );
        },
        [workspace]
    );

    return {
        stacks,
        isLoading: workspace.status === "loading",
        isError: workspace.status === "unavailable",
        error:
            error ??
            (workspace.status === "mismatch" ? workspace.error : null),
        pending,
        getStack,
        getStackRecord,
        createStack,
        updateStack,
        deleteStack,
    };
}
