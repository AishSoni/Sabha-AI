/**
 * Practice knowledge-stack operations (spec-25).
 *
 * Stack contents are live for already-assigned practice participants, while
 * deleting a stack revokes its practice documents first and drops it from
 * current persona defaults.
 */
import {
    WORKSPACE_LIMITS,
    type WorkspaceLocalState,
    type WorkspaceStack,
} from "@/features/demo-workspace/contract";
import { scopeCounts } from "./document-state";

export type StackMutationFailure =
    | "not_found"
    | "invalid_name"
    | "limit_reached";

export type StackMutationResult =
    | { ok: true; state: WorkspaceLocalState; stack: WorkspaceStack }
    | { ok: false; reason: StackMutationFailure };

function normalizeName(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) return null;
    return trimmed;
}

export function createLocalStack(
    state: WorkspaceLocalState,
    input: { stackId: string; name: string; description: string }
): StackMutationResult {
    const name = normalizeName(input.name);
    if (!name) return { ok: false, reason: "invalid_name" };
    if (state.stacks.length >= WORKSPACE_LIMITS.stacks) {
        return { ok: false, reason: "limit_reached" };
    }
    const stack: WorkspaceStack = {
        stackId: input.stackId,
        label: name,
        scope: "shared",
        description: input.description.trim(),
    };
    return {
        ok: true,
        state: { ...state, stacks: [...state.stacks, stack] },
        stack,
    };
}

export function updateLocalStack(
    state: WorkspaceLocalState,
    stackId: string,
    input: { name: string; description: string }
): StackMutationResult {
    const existing = state.stacks.find((stack) => stack.stackId === stackId);
    if (!existing) return { ok: false, reason: "not_found" };
    const name = normalizeName(input.name);
    if (!name) return { ok: false, reason: "invalid_name" };
    const stack: WorkspaceStack = {
        ...existing,
        label: name,
        description: input.description.trim(),
    };
    return {
        ok: true,
        state: {
            ...state,
            stacks: state.stacks.map((candidate) =>
                candidate.stackId === stackId ? stack : candidate
            ),
        },
        stack,
    };
}

/**
 * Revokes every practice document in the stack before removing the stack and
 * its current persona bindings. Saved participant snapshots keep their stack
 * ids as historical references and resolve them as unavailable.
 */
export function deleteLocalStack(
    state: WorkspaceLocalState,
    stackId: string
): WorkspaceLocalState {
    if (!state.stacks.some((stack) => stack.stackId === stackId)) return state;
    const revokedAt = new Date().toISOString();
    return {
        ...state,
        stacks: state.stacks.filter((stack) => stack.stackId !== stackId),
        documents: state.documents.map((document) =>
            document.scopeKind === "stack" &&
            document.scopeId === stackId &&
            document.status !== "revoked"
                ? {
                      ...document,
                      status: "revoked",
                      chunkCount: 0,
                      errorMessage: null,
                      revokedAt,
                  }
                : document
        ),
        personas: state.personas.map((persona) =>
            persona.stackIds.includes(stackId)
                ? {
                      ...persona,
                      stackIds: persona.stackIds.filter((id) => id !== stackId),
                  }
                : persona
        ),
        participantSnapshots: state.participantSnapshots.map((snapshot) =>
            snapshot.stackIds.includes(stackId)
                ? {
                      ...snapshot,
                      unavailableStackIds: [
                          ...new Set([
                              ...(snapshot.unavailableStackIds ?? []),
                              stackId,
                          ]),
                      ],
                  }
                : snapshot
        ),
    };
}

export function assignedPersonas(
    state: WorkspaceLocalState,
    stackId: string
): string[] {
    return state.personas
        .filter((persona) => persona.stackIds.includes(stackId))
        .map((persona) => persona.name);
}

export function stackDocumentCounts(
    state: WorkspaceLocalState,
    stackId: string
): { total: number; ready: number } {
    return scopeCounts(state.documents, { kind: "stack", id: stackId });
}
