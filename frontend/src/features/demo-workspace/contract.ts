/**
 * Demo workspace contracts (spec-23).
 *
 * The workspace is volatile browser memory. It owns the demo catalog state and
 * the guide bookmark; the replay run keeps checkpoint, epoch, and projections.
 * Nothing here persists across a refresh and nothing here can reach a live
 * adapter.
 */

export const WORKSPACE_LIMITS = {
    personas: 16,
    stacks: 16,
    documents: 64,
    revisionsPerPersona: 16,
    promptChars: 16_384,
    baseInstructionChars: 16_384,
    totalPromptChars: 524_288,
    participantSnapshots: 16,
    concurrentDocumentOps: 2,
    samples: 16,
    sampleBytes: 2_097_152,
    totalSampleBytes: 8_388_608,
    chunksPerDocument: 256,
} as const;

export interface WorkspaceRevision {
    revisionId: string;
    prompt: string;
    reason: string;
    createdAt: string;
    /** Authored seed history vs a temporary local edit. */
    origin?: "seed" | "local";
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
    recordedParticipantId?: string | null;
}

export interface WorkspaceStack {
    stackId: string;
    label: string;
    scope: "shared" | "private";
    description: string;
}

export type WorkspaceDocumentStatus =
    | "pending"
    | "processing"
    | "ready"
    | "failed"
    | "revoked"
    | "unavailable";

export type SampleDestination = "meeting" | "stack";

export type WorkspaceSampleRole =
    | "shared-research"
    | "participant-notes"
    | "mandate-material"
    | "failure-retry";

/**
 * One explicitly approved source in the demo upload allowlist.
 *
 * The sample record is separate from the evidence asset catalog. An asset can
 * be previewable or cited without becoming uploadable.
 */
export interface WorkspaceSample {
    sampleId: string;
    assetId: string;
    fileName: string;
    mediaType: string;
    sizeBytes: number;
    sha256: string;
    role: WorkspaceSampleRole;
    destinationKinds: SampleDestination[];
    description: string;
    accessibleLabel: string;
    provenance: "demo-authored" | "approved-source";
    rightsStatus: "approved-for-upload";
    approvedAt: string;
    previewMode: "inline" | "unsupported";
    previewNote: string | null;
    scenarioId: "ready-after-indexing" | "fail-once";
    preparedChunkCount: number;
    failureMessage: string | null;
}

export interface WorkspaceDocument {
    documentId: string;
    sampleId: string;
    scopeKind: SampleDestination;
    scopeId: string;
    status: WorkspaceDocumentStatus;
    operationId: string;
    revisionId: string;
    chunkCount: number;
    createdAt: string;
    errorMessage?: string | null;
    /** Bounded retry count for the prepared scenario. */
    attempts?: number;
    revokedAt?: string;
    /** Authored seed state vs a temporary local document. */
    origin?: "seed" | "local";
}

export interface WorkspaceSeed {
    seedVersion: number;
    baseInstructions: string | null;
    highlightedPersonaId: string | null;
    disclosure: { practice: string; recording: string };
    personas: WorkspacePersona[];
    stacks: WorkspaceStack[];
    samples: WorkspaceSample[];
    documents: WorkspaceDocument[];
}

/** A frozen copy of what a new demo participant would capture. */
export interface LocalParticipantSnapshot {
    snapshotId: string;
    personaId: string;
    name: string;
    role: string;
    color: string;
    composedPrompt: string;
    stackIds: string[];
    sourceRevisionId: string;
    sourceRevisionNumber: number;
    createdAt: string;
    /** Saved stack references whose stack template has since been deleted. */
    unavailableStackIds?: string[];
}

export interface WorkspaceLocalState {
    personas: WorkspacePersona[];
    stacks: WorkspaceStack[];
    participantSnapshots: LocalParticipantSnapshot[];
    documents: WorkspaceDocument[];
}

export interface PinnedPackageIdentity {
    packageId: string;
    version: string;
    contentSha256: string;
    meetingId: string;
}

/** Metadata for an immutable public package asset, passed in by composition. */
export interface WorkspacePublishedAsset {
    assetId: string;
    publicUrl: string;
    mediaType: string;
    sha256: string;
    sizeBytes: number;
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
    return {
        personas: [],
        stacks: [],
        participantSnapshots: [],
        documents: [],
    };
}

export function localStateFromSeed(
    seed: WorkspaceSeed | null
): WorkspaceLocalState {
    if (!seed) return emptyLocalState();
    return {
        personas: seed.personas.map((persona) => ({
            ...persona,
            stackIds: [...persona.stackIds],
            revisions: persona.revisions.map((revision) => ({
                ...revision,
                origin: "seed",
            })),
        })),
        stacks: seed.stacks.map((stack) => ({ ...stack })),
        participantSnapshots: [],
        documents: seed.documents.map((document) => ({
            ...document,
            origin: "seed",
        })),
    };
}
