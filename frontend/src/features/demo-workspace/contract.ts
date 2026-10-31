/**
 * Demo workspace contracts (spec-23).
 *
 * The workspace is volatile browser memory. It owns practice catalog state and
 * the guide bookmark; the replay run keeps checkpoint, epoch, and projections.
 * Nothing here persists across a refresh and nothing here can reach a live
 * adapter.
 */

export const WORKSPACE_LIMITS = {
    personas: 16,
    stacks: 16,
    documents: 64,
    practiceSetups: 8,
    revisionsPerPersona: 16,
    promptChars: 16_384,
    totalPromptChars: 524_288,
    concurrentDocumentOps: 2,
} as const;

export interface WorkspaceRevision {
    revisionId: string;
    prompt: string;
    reason: string;
    createdAt: string;
}

export interface WorkspacePersona {
    personaId: string;
    name: string;
    role: string;
    description: string;
    color: string;
    stackIds: string[];
    revisions: WorkspaceRevision[];
    activeRevisionId: string;
}

export interface WorkspaceStack {
    stackId: string;
    label: string;
    scope: "shared" | "private";
    description: string;
}

export interface WorkspacePracticeSetup {
    setupId: string;
    label: string;
    description: string;
    recordedExampleId: string;
}

export interface WorkspaceSeed {
    seedVersion: number;
    disclosure: { practice: string; recording: string };
    personas: WorkspacePersona[];
    stacks: WorkspaceStack[];
    practiceSetups: WorkspacePracticeSetup[];
}

export interface WorkspaceLocalState {
    personas: WorkspacePersona[];
    stacks: WorkspaceStack[];
    practiceSetups: WorkspacePracticeSetup[];
}

export interface PinnedPackageIdentity {
    packageId: string;
    version: string;
    contentSha256: string;
    meetingId: string;
}

export type WorkspaceStatus =
    | "loading"
    | "ready"
    | "legacy"
    | "unavailable"
    | "mismatch";

export type LocalOutcome<T> =
    | { ok: true; scope: "local"; value: T }
    | { ok: false; scope: "local"; code: "workspace_reset" | "limit_reached"; message: string };

export interface PlaybackReset {
    nonce: number;
    reason: "workspace" | "recording";
}

export function workspaceQueryKey(
    workspaceId: string,
    domain: string
): readonly [string, string, string] {
    return ["workspace", workspaceId, domain] as const;
}

export function emptyLocalState(): WorkspaceLocalState {
    return { personas: [], stacks: [], practiceSetups: [] };
}

export function localStateFromSeed(
    seed: WorkspaceSeed | null
): WorkspaceLocalState {
    if (!seed) return emptyLocalState();
    return {
        personas: seed.personas.map((persona) => ({
            ...persona,
            stackIds: [...persona.stackIds],
            revisions: persona.revisions.map((revision) => ({ ...revision })),
        })),
        stacks: seed.stacks.map((stack) => ({ ...stack })),
        practiceSetups: seed.practiceSetups.map((setup) => ({ ...setup })),
    };
}
