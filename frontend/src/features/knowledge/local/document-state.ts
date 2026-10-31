/**
 * Practice document state machine (spec-25).
 *
 * The package supplies data-only scenarios. This module owns the bounded
 * transitions and mirrors the shared document vocabulary without reproducing
 * extraction or chunking substeps the live contract does not expose.
 */
import {
    WORKSPACE_LIMITS,
    type WorkspaceDocument,
    type WorkspaceLocalState,
    type WorkspaceSample,
} from "@/features/demo-workspace";

export type AddDocumentFailure =
    | "sample_unavailable"
    | "destination_not_allowed"
    | "duplicate_sample"
    | "limit_reached"
    | "concurrent_limit";

export type AddDocumentResult =
    | { ok: true; state: WorkspaceLocalState; document: WorkspaceDocument }
    | { ok: false; reason: AddDocumentFailure };

export interface AddDocumentIds {
    documentId: string;
    operationId: string;
    revisionId: string;
    createdAt: string;
}

export interface LocalDocumentScope {
    kind: "meeting" | "stack";
    id: string;
}

export function activeDocuments(
    documents: readonly WorkspaceDocument[]
): WorkspaceDocument[] {
    return documents.filter((document) => document.status !== "revoked");
}

export function isPending(document: WorkspaceDocument): boolean {
    return document.status === "pending" || document.status === "processing";
}

export function concurrentOperationCount(
    documents: readonly WorkspaceDocument[]
): number {
    return documents.filter(isPending).length;
}

export function sampleAlreadyAdded(
    documents: readonly WorkspaceDocument[],
    sampleId: string,
    scope: LocalDocumentScope
): boolean {
    return documents.some(
        (document) =>
            document.status !== "revoked" &&
            document.sampleId === sampleId &&
            document.scopeKind === scope.kind &&
            document.scopeId === scope.id
    );
}

export function addLocalDocument(
    state: WorkspaceLocalState,
    sample: WorkspaceSample | undefined,
    scope: LocalDocumentScope,
    ids: AddDocumentIds
): AddDocumentResult {
    if (!sample) return { ok: false, reason: "sample_unavailable" };
    if (!sample.destinationKinds.includes(scope.kind)) {
        return { ok: false, reason: "destination_not_allowed" };
    }
    if (sampleAlreadyAdded(state.documents, sample.sampleId, scope)) {
        return { ok: false, reason: "duplicate_sample" };
    }
    if (state.documents.length >= WORKSPACE_LIMITS.documents) {
        return { ok: false, reason: "limit_reached" };
    }
    if (
        concurrentOperationCount(state.documents) >=
        WORKSPACE_LIMITS.concurrentDocumentOps
    ) {
        return { ok: false, reason: "concurrent_limit" };
    }
    const document: WorkspaceDocument = {
        documentId: ids.documentId,
        sampleId: sample.sampleId,
        scopeKind: scope.kind,
        scopeId: scope.id,
        status: "pending",
        operationId: ids.operationId,
        revisionId: ids.revisionId,
        chunkCount: 0,
        createdAt: ids.createdAt,
        errorMessage: null,
        origin: "local",
    };
    return {
        ok: true,
        state: { ...state, documents: [...state.documents, document] },
        document,
    };
}

export type DocumentTransition =
    | { kind: "none" }
    | { kind: "to-processing" }
    | { kind: "to-ready"; chunkCount: number }
    | { kind: "to-failed"; message: string };

/**
 * One package-selected transition. Pending has no automatic path to ready;
 * the adapter must first observe a processing step.
 */
export function nextTransition(
    document: WorkspaceDocument,
    sample: WorkspaceSample | undefined
): DocumentTransition {
    if (!sample) return { kind: "none" };
    if (document.status === "pending") return { kind: "to-processing" };
    if (document.status !== "processing") return { kind: "none" };
    if (sample.scenarioId === "fail-once" && (document.attempts ?? 0) === 0) {
        return {
            kind: "to-failed",
            message:
                sample.failureMessage ??
                "The prepared ingestion stopped before indexing.",
        };
    }
    return {
        kind: "to-ready",
        chunkCount: sample.preparedChunkCount,
    };
}

function updateDocument(
    state: WorkspaceLocalState,
    documentId: string,
    update: (document: WorkspaceDocument) => WorkspaceDocument
): WorkspaceLocalState {
    return {
        ...state,
        documents: state.documents.map((document) =>
            document.documentId === documentId ? update(document) : document
        ),
    };
}

/**
 * Applies the next bounded step for one document. Unknown, removed, failed,
 * and already-ready documents are left untouched.
 */
export function advanceLocalDocument(
    state: WorkspaceLocalState,
    documentId: string,
    sample: WorkspaceSample | undefined
): WorkspaceLocalState {
    const document = state.documents.find(
        (candidate) => candidate.documentId === documentId
    );
    if (!document) return state;
    const transition = nextTransition(document, sample);
    if (transition.kind === "none") return state;
    return updateDocument(state, documentId, (current) => {
        if (transition.kind === "to-processing") {
            return { ...current, status: "processing" };
        }
        if (transition.kind === "to-failed") {
            return {
                ...current,
                status: "failed",
                errorMessage: transition.message,
            };
        }
        return {
            ...current,
            status: "ready",
            chunkCount: transition.chunkCount,
            errorMessage: null,
        };
    });
}

/**
 * Retry retains the document, operation, and revision identity. The bytes are
 * already represented by the sample; nothing is resent or cloned.
 */
export function retryLocalDocument(
    state: WorkspaceLocalState,
    documentId: string
): WorkspaceLocalState {
    const document = state.documents.find(
        (candidate) => candidate.documentId === documentId
    );
    if (!document || document.status !== "failed") return state;
    return updateDocument(state, documentId, (current) => ({
        ...current,
        status: "pending",
        attempts: (current.attempts ?? 0) + 1,
        errorMessage: null,
    }));
}

/**
 * Revocation is immediate. Any later transition is ignored because the state
 * machine no longer accepts work for a revoked document.
 */
export function removeLocalDocument(
    state: WorkspaceLocalState,
    documentId: string
): WorkspaceLocalState {
    const document = state.documents.find(
        (candidate) => candidate.documentId === documentId
    );
    if (!document || document.status === "revoked") return state;
    return updateDocument(state, documentId, (current) => ({
        ...current,
        status: "revoked",
        chunkCount: 0,
        errorMessage: null,
    }));
}

export function scopeDocuments(
    documents: readonly WorkspaceDocument[],
    scope: LocalDocumentScope
): WorkspaceDocument[] {
    return documents.filter(
        (document) =>
            document.scopeKind === scope.kind &&
            document.scopeId === scope.id &&
            document.status !== "revoked"
    );
}

export function scopeCounts(
    documents: readonly WorkspaceDocument[],
    scope: LocalDocumentScope
): { total: number; ready: number } {
    const scoped = scopeDocuments(documents, scope);
    return {
        total: scoped.length,
        ready: scoped.filter((document) => document.status === "ready").length,
    };
}

export interface PracticeParticipantScope {
    participantId: string;
    meetingId: string;
    stackIds: readonly string[];
}

export function participantCanRetrieve(
    document: WorkspaceDocument,
    participant: PracticeParticipantScope
): boolean {
    if (document.status !== "ready") return false;
    if (document.scopeKind === "meeting") {
        return document.scopeId === participant.meetingId;
    }
    return participant.stackIds.includes(document.scopeId);
}
