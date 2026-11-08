import { describe, expect, it } from "vitest";
import {
    WORKSPACE_LIMITS,
    emptyLocalState,
    type WorkspaceDocument,
    type WorkspaceLocalState,
    type WorkspaceSample,
} from "@/features/demo-workspace";
import {
    addLocalDocument,
    advanceLocalDocument,
    concurrentOperationCount,
    participantCanRetrieve,
    removeLocalDocument,
    retryLocalDocument,
    scopeCounts,
    type LocalDocumentScope,
} from "./document-state";

function sample(overrides: Partial<WorkspaceSample> = {}): WorkspaceSample {
    return {
        sampleId: "sample-shared",
        assetId: "shared-asset",
        fileName: "shared.md",
        mediaType: "text/markdown",
        sizeBytes: 100,
        sha256: "a".repeat(64),
        role: "shared-research",
        destinationKinds: ["meeting", "stack"],
        description: "Shared research.",
        accessibleLabel: "Upload shared research",
        provenance: "demo-authored",
        rightsStatus: "approved-for-upload",
        approvedAt: "2026-10-31",
        previewMode: "inline",
        previewNote: null,
        scenarioId: "ready-after-indexing",
        preparedChunkCount: 4,
        failureMessage: null,
        ...overrides,
    };
}

function add(
    state: WorkspaceLocalState,
    input: WorkspaceSample | undefined,
    scope: LocalDocumentScope = { kind: "stack", id: "stack-shared" },
    suffix = "1"
) {
    return addLocalDocument(state, input, scope, {
        documentId: `document-${suffix}`,
        operationId: `operation-${suffix}`,
        revisionId: `revision-${suffix}`,
        createdAt: "2026-10-31",
    });
}

function readyDocument(
    id: string,
    overrides: Partial<WorkspaceDocument> = {}
): WorkspaceDocument {
    return {
        documentId: id,
        sampleId: "sample-shared",
        scopeKind: "stack",
        scopeId: "stack-shared",
        status: "ready",
        operationId: `operation-${id}`,
        revisionId: `revision-${id}`,
        chunkCount: 4,
        createdAt: "2026-10-31",
        ...overrides,
    };
}

describe("document state", () => {
    it("moves one document from queued to indexing to ready", () => {
        const sampleRecord = sample();
        const added = add(emptyLocalState(), sampleRecord);
        expect(added.ok).toBe(true);
        if (!added.ok) return;
        expect(added.document.status).toBe("pending");
        expect(added.document.chunkCount).toBe(0);
        expect(concurrentOperationCount(added.state.documents)).toBe(1);

        const indexing = advanceLocalDocument(
            added.state,
            added.document.documentId,
            sampleRecord
        );
        expect(indexing.documents[0]?.status).toBe("processing");
        expect(indexing.documents[0]?.chunkCount).toBe(0);

        const ready = advanceLocalDocument(
            indexing,
            added.document.documentId,
            sampleRecord
        );
        expect(ready.documents[0]?.status).toBe("ready");
        expect(ready.documents[0]?.chunkCount).toBe(4);
        expect(ready.documents[0]?.operationId).toBe("operation-1");
        expect(ready.documents[0]?.revisionId).toBe("revision-1");
        expect(concurrentOperationCount(ready.documents)).toBe(0);
    });

    it("fails once then retries on the same identities without resending bytes", () => {
        const sampleRecord = sample({
            sampleId: "sample-downside",
            scenarioId: "fail-once",
            preparedChunkCount: 3,
            failureMessage: "The prepared first attempt stopped.",
        });
        const added = add(emptyLocalState(), sampleRecord);
        expect(added.ok).toBe(true);
        if (!added.ok) return;

        const indexing = advanceLocalDocument(
            added.state,
            added.document.documentId,
            sampleRecord
        );
        const failed = advanceLocalDocument(
            indexing,
            added.document.documentId,
            sampleRecord
        );
        expect(failed.documents[0]?.status).toBe("failed");
        expect(failed.documents[0]?.errorMessage).toBe(
            "The prepared first attempt stopped."
        );

        const retried = retryLocalDocument(failed, added.document.documentId);
        expect(retried.documents[0]).toMatchObject({
            documentId: "document-1",
            operationId: "operation-1",
            revisionId: "revision-1",
            status: "pending",
            attempts: 1,
        });
        expect(retried.documents).toHaveLength(1);

        const retryIndexing = advanceLocalDocument(
            retried,
            added.document.documentId,
            sampleRecord
        );
        const ready = advanceLocalDocument(
            retryIndexing,
            added.document.documentId,
            sampleRecord
        );
        expect(ready.documents[0]).toMatchObject({
            documentId: "document-1",
            operationId: "operation-1",
            revisionId: "revision-1",
            status: "ready",
            chunkCount: 3,
            attempts: 1,
        });
        expect(retryLocalDocument(ready, added.document.documentId)).toBe(ready);
    });

    it("blocks duplicates in one destination but allows another scope and re-add after removal", () => {
        const sampleRecord = sample();
        const first = add(emptyLocalState(), sampleRecord);
        expect(first.ok).toBe(true);
        if (!first.ok) return;

        expect(add(first.state, sampleRecord).ok ? "added" : "blocked").toBe(
            "blocked"
        );
        const otherScope = add(
            first.state,
            sampleRecord,
            { kind: "meeting", id: "meeting-1" },
            "2"
        );
        expect(otherScope.ok).toBe(true);
        if (!otherScope.ok) return;
        expect(otherScope.document.documentId).not.toBe(
            first.document.documentId
        );

        const removed = removeLocalDocument(otherScope.state, "document-1");
        expect(removed.documents[0]?.status).toBe("revoked");
        const readded = add(
            removed,
            sampleRecord,
            { kind: "stack", id: "stack-shared" },
            "3"
        );
        expect(readded.ok).toBe(true);
        if (!readded.ok) return;
        expect(readded.document.documentId).toBe("document-3");
        expect(readded.document.operationId).toBe("operation-3");
        expect(readded.document.revisionId).toBe("revision-3");
        expect(
            readded.state.documents.find(
                (document) => document.documentId === "document-1"
            )?.status
        ).toBe("revoked");
    });

    it("rejects unavailable samples, disallowed destinations, and exceeded ceilings", () => {
        expect(add(emptyLocalState(), undefined).ok).toBe(false);
        expect(
            add(
                emptyLocalState(),
                sample({ destinationKinds: ["meeting"] }),
                { kind: "stack", id: "stack-shared" }
            ).ok
        ).toBe(false);

        const crowded: WorkspaceLocalState = {
            ...emptyLocalState(),
            documents: Array.from(
                { length: WORKSPACE_LIMITS.documents },
                (_, index) => readyDocument(`document-${index}`)
            ),
        };
        expect(add(crowded, sample(), { kind: "meeting", id: "meeting-1" }).ok).toBe(
            false
        );

        const busy = add(emptyLocalState(), sample());
        if (!busy.ok) throw new Error("expected first add");
        const second = add(
            busy.state,
            sample({ sampleId: "sample-second" }),
            { kind: "meeting", id: "meeting-1" },
            "2"
        );
        if (!second.ok) throw new Error("expected second add");
        expect(
            add(
                second.state,
                sample({ sampleId: "sample-third" }),
                { kind: "meeting", id: "meeting-2" },
                "3"
            ).ok
        ).toBe(false);
    });

    it("revokes eligibility immediately and ignores late transitions", () => {
        const sampleRecord = sample();
        const added = add(emptyLocalState(), sampleRecord);
        if (!added.ok) throw new Error("expected add");
        const indexing = advanceLocalDocument(
            added.state,
            added.document.documentId,
            sampleRecord
        );
        const removed = removeLocalDocument(indexing, added.document.documentId);
        expect(removed.documents[0]?.status).toBe("revoked");
        expect(removed.documents[0]?.chunkCount).toBe(0);
        expect(
            advanceLocalDocument(removed, added.document.documentId, sampleRecord)
        ).toBe(removed);
        expect(
            retryLocalDocument(removed, added.document.documentId)
        ).toBe(removed);
        expect(scopeCounts(removed.documents, {
            kind: "stack",
            id: "stack-shared",
        })).toEqual({ total: 0, ready: 0 });
    });

    it("derives participant visibility from ready revisions and saved stacks", () => {
        const documents = [
            readyDocument("stack-ready", { scopeId: "stack-shared" }),
            readyDocument("meeting-ready", {
                scopeKind: "meeting",
                scopeId: "meeting-1",
            }),
            readyDocument("other-stack", { scopeId: "stack-private" }),
            readyDocument("other-meeting", {
                scopeKind: "meeting",
                scopeId: "meeting-2",
            }),
            readyDocument("pending", { status: "processing" }),
            readyDocument("removed", { status: "revoked" }),
        ];
        const participant = {
            participantId: "participant-1",
            meetingId: "meeting-1",
            stackIds: ["stack-shared"],
        };
        expect(
            documents
                .filter((document) =>
                    participantCanRetrieve(document, participant)
                )
                .map((document) => document.documentId)
        ).toEqual(["stack-ready", "meeting-ready"]);
    });
});
