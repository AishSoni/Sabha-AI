import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Document } from "@/features/knowledge";
import { ApiError } from "@/shared/api/errors";
import type { ByteResponse } from "@/shared/api/transport";
import { isEvidenceLoadError } from "../evidence/contract";
import {
    createLiveEvidence,
    liveDescriptorForDocument,
    liveEvidenceId,
    mediaForFileType,
    parseLiveEvidenceId,
} from "./live-evidence";

function documentRow(overrides: Partial<Document> = {}): Document {
    return {
        id: "11111111-1111-4111-8111-111111111111",
        file_name: "issuer-note.md",
        file_type: "md",
        file_size_bytes: 2048,
        chunk_count: 4,
        qdrant_collection: "meeting_m1_shared",
        status: "ready",
        error_message: null,
        created_at: "2026-10-30T00:00:00Z",
        meeting_id: "m1",
        persona_id: null,
        stack_id: null,
        revision_id: "22222222-2222-4222-8222-222222222222",
        revision_state: "ready",
        operation_id: null,
        ...overrides,
    } as Document;
}

function byteResponse(overrides: Partial<ByteResponse> = {}): ByteResponse {
    return {
        bytes: new Uint8Array([104, 105]),
        contentType: "text/plain",
        contentLength: 2,
        fileName: null,
        ...overrides,
    };
}

describe("live evidence identity", () => {
    it("round-trips a document/revision identity without inventing a path", () => {
        const id = liveEvidenceId("doc-1", "rev-1");
        expect(id).toBe("live:doc-1:rev-1");
        expect(parseLiveEvidenceId(id)).toEqual({ documentId: "doc-1", revisionId: "rev-1" });
        expect(parseLiveEvidenceId("replay:asset")).toBeNull();
        expect(parseLiveEvidenceId("live:doc-1")).toBeNull();
    });

    it("maps every supported upload format to a renderable media type", () => {
        expect(mediaForFileType("pdf")).toEqual({
            media_type: "application/pdf",
            derived_from: null,
        });
        expect(mediaForFileType("md")).toEqual({
            media_type: "text/markdown",
            derived_from: null,
        });
        expect(mediaForFileType("csv")).toEqual({
            media_type: "text/csv",
            derived_from: null,
        });
        expect(mediaForFileType("txt")).toEqual({
            media_type: "text/plain",
            derived_from: null,
        });
        expect(mediaForFileType("docx")).toEqual({
            media_type: "text/plain",
            derived_from: "docx",
        });
        expect(mediaForFileType("xlsx")).toEqual({
            media_type: "text/plain",
            derived_from: "xlsx",
        });
    });
});

describe("live descriptor", () => {
    it("marks a ready document with a retained revision as previewable", () => {
        const descriptor = liveDescriptorForDocument(documentRow());

        expect(descriptor.readiness).toBe("ready");
        expect(descriptor.media_type).toBe("text/markdown");
        expect(descriptor.evidence_id).toBe(
            liveEvidenceId("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222")
        );
        expect(descriptor.provenance.label).toBe("Live document");
        expect(descriptor.provenance.detail).toContain("Revision 22222222");
    });

    it("keeps pending or revision-less rows honestly unavailable", () => {
        const pending = liveDescriptorForDocument(
            documentRow({ status: "pending", revision_state: "pending" })
        );
        expect(pending.readiness).toBe("unavailable");
        expect(pending.unavailable_reason).toBeTruthy();

        const noRevision = liveDescriptorForDocument(
            documentRow({ status: "ready", revision_id: null, revision_state: null })
        );
        expect(noRevision.readiness).toBe("unavailable");
    });

    it("labels DOCX/XLSX previews as derived text", () => {
        const descriptor = liveDescriptorForDocument(
            documentRow({ file_name: "model.xlsx", file_type: "xlsx" })
        );
        expect(descriptor.media_type).toBe("text/plain");
        expect(descriptor.derived_from).toBe("xlsx");
    });
});

describe("createLiveEvidence", () => {
    const documentId = "11111111-1111-4111-8111-111111111111";
    const revisionId = "22222222-2222-4222-8222-222222222222";

    beforeEach(() => {
        vi.stubGlobal("URL", {
            createObjectURL: vi.fn(() => "blob:evidence"),
            revokeObjectURL: vi.fn(),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("lists only the requested meeting scope through the knowledge client", async () => {
        const listDocuments = vi.fn(async () => [documentRow()]);
        const evidence = createLiveEvidence({ listDocuments });

        const descriptors = await evidence.list("meeting-1");

        expect(listDocuments).toHaveBeenCalledWith("meeting-1");
        expect(descriptors).toHaveLength(1);
        expect(await evidence.list()).toEqual([]);
    });

    it("resolves a citation to the exact cited revision, not the latest one", async () => {
        const getDocument = vi.fn(async () =>
            documentRow({ revision_id: "newer-revision", revision_state: "ready" })
        );
        const evidence = createLiveEvidence({ getDocument });

        const descriptor = await evidence.resolveCitation({
            document_id: documentId,
            revision_id: revisionId,
            title: "issuer-note.md",
            source: "knowledge",
        });

        expect(getDocument).toHaveBeenCalledWith(documentId);
        expect(descriptor?.readiness).toBe("ready");
        expect(descriptor?.evidence_id).toBe(liveEvidenceId(documentId, revisionId));
    });

    it("shows an honest unavailable descriptor when the document was deleted", async () => {
        const getDocument = vi.fn(async () => {
            throw new ApiError("http", 404, "Document not found");
        });
        const evidence = createLiveEvidence({ getDocument });

        const descriptor = await evidence.resolveCitation({
            document_id: documentId,
            revision_id: revisionId,
            title: "removed.pdf",
            source: "knowledge",
        });

        expect(descriptor?.readiness).toBe("unavailable");
        expect(descriptor?.media_type).toBe("application/pdf");
        expect(descriptor?.unavailable_reason).toContain("no longer available");
    });

    it("does not resolve a citation without exact revision identity", async () => {
        const getDocument = vi.fn();
        const evidence = createLiveEvidence({ getDocument });

        expect(
            await evidence.resolveCitation({ document_id: documentId, title: "x.md" })
        ).toBeNull();
        expect(getDocument).not.toHaveBeenCalled();
    });

    it("loads original Markdown bytes through the same-origin revision route", async () => {
        const fetchBytes = vi.fn(async () =>
            byteResponse({
                bytes: new TextEncoder().encode("# Heading"),
                contentType: "text/markdown; charset=utf-8",
                contentLength: 9,
            })
        );
        const evidence = createLiveEvidence({ fetchBytes });
        const descriptor = liveDescriptorForDocument(documentRow());

        const content = await evidence.load(descriptor, {
            signal: new AbortController().signal,
        });

        expect(fetchBytes).toHaveBeenCalledWith(
            `/documents/${documentId}/revisions/${revisionId}/content`,
            expect.objectContaining({
                query: { representation: "original" },
                headers: { Accept: "text/markdown" },
            })
        );
        expect(content).toMatchObject({
            kind: "markdown",
            text: "# Heading",
            truncated: false,
        });
    });

    it("requests derived text for DOCX and labels it derived", async () => {
        const fetchBytes = vi.fn(async () =>
            byteResponse({
                bytes: new TextEncoder().encode("Extracted body"),
                contentType: "text/plain; charset=utf-8",
            })
        );
        const evidence = createLiveEvidence({ fetchBytes });
        const descriptor = liveDescriptorForDocument(
            documentRow({ file_name: "memo.docx", file_type: "docx" })
        );

        const content = await evidence.load(descriptor, {
            signal: new AbortController().signal,
        });

        expect(fetchBytes).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ query: { representation: "text" } })
        );
        expect(content).toMatchObject({
            kind: "derived",
            text: "Extracted body",
            derived_from: "docx",
        });
    });

    it("loads original TXT and CSV bytes with their own renderers", async () => {
        const cases = [
            {
                file_type: "txt",
                file_name: "notes.txt",
                media_type: "text/plain",
                kind: "text",
                body: "Plain notes",
            },
            {
                file_type: "csv",
                file_name: "table.csv",
                media_type: "text/csv",
                kind: "csv",
                body: "name,value\nalpha,1",
            },
        ] as const;

        for (const item of cases) {
            const fetchBytes = vi.fn(async () =>
                byteResponse({
                    bytes: new TextEncoder().encode(item.body),
                    contentType: `${item.media_type}; charset=utf-8`,
                })
            );
            const evidence = createLiveEvidence({ fetchBytes });
            const descriptor = liveDescriptorForDocument(
                documentRow({
                    file_name: item.file_name,
                    file_type: item.file_type,
                })
            );

            const content = await evidence.load(descriptor, {
                signal: new AbortController().signal,
            });

            expect(fetchBytes).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    query: { representation: "original" },
                    headers: { Accept: item.media_type },
                })
            );
            expect(content).toMatchObject({
                kind: item.kind,
                text: item.body,
            });
        }
    });

    it("requests derived text for XLSX and labels it derived", async () => {
        const fetchBytes = vi.fn(async () =>
            byteResponse({
                bytes: new TextEncoder().encode("Sheet: Summary\nRevenue 100"),
                contentType: "text/plain; charset=utf-8",
            })
        );
        const evidence = createLiveEvidence({ fetchBytes });
        const descriptor = liveDescriptorForDocument(
            documentRow({ file_name: "model.xlsx", file_type: "xlsx" })
        );

        const content = await evidence.load(descriptor, {
            signal: new AbortController().signal,
        });

        expect(fetchBytes).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ query: { representation: "text" } })
        );
        expect(content).toMatchObject({
            kind: "derived",
            derived_from: "xlsx",
        });
    });

    it("creates a local blob URL for PDF and revokes it on dispose", async () => {
        const fetchBytes = vi.fn(async () =>
            byteResponse({
                bytes: new TextEncoder().encode("%PDF-1.7\nbody"),
                contentType: "application/pdf",
            })
        );
        const evidence = createLiveEvidence({ fetchBytes });
        const descriptor = liveDescriptorForDocument(
            documentRow({ file_name: "report.pdf", file_type: "pdf" })
        );

        const content = await evidence.load(descriptor, {
            signal: new AbortController().signal,
        });

        expect(content.kind).toBe("pdf");
        if (content.kind === "pdf") {
            expect(content.url).toBe("blob:evidence");
            content.dispose();
            expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:evidence");
        }
    });

    it("maps revocation to unavailable without falling back to a URL", async () => {
        const fetchBytes = vi.fn(async () => {
            throw new ApiError("http", 410, "Revision revoked");
        });
        const evidence = createLiveEvidence({ fetchBytes });
        const descriptor = liveDescriptorForDocument(documentRow());

        const failure = await evidence
            .load(descriptor, { signal: new AbortController().signal })
            .catch((error: unknown) => error);

        expect(isEvidenceLoadError(failure)).toBe(true);
        if (isEvidenceLoadError(failure)) {
            expect(failure.kind).toBe("unavailable");
            expect(failure.retryable).toBe(false);
        }
    });

    it("rejects a response whose media type does not match the descriptor", async () => {
        const fetchBytes = vi.fn(async () =>
            byteResponse({ contentType: "text/html", bytes: new TextEncoder().encode("<html>") })
        );
        const evidence = createLiveEvidence({ fetchBytes });

        const failure = await evidence
            .load(liveDescriptorForDocument(documentRow()), {
                signal: new AbortController().signal,
            })
            .catch((error: unknown) => error);

        expect(isEvidenceLoadError(failure)).toBe(true);
        if (isEvidenceLoadError(failure)) {
            expect(failure.kind).toBe("wrong_type");
        }
    });

    it("propagates an abort as a non-retryable aborted error", async () => {
        const fetchBytes = vi.fn(async () => {
            throw new ApiError("aborted", null, "Request aborted");
        });
        const evidence = createLiveEvidence({ fetchBytes });

        const failure = await evidence
            .load(liveDescriptorForDocument(documentRow()), {
                signal: new AbortController().signal,
            })
            .catch((error: unknown) => error);

        expect(isEvidenceLoadError(failure)).toBe(true);
        if (isEvidenceLoadError(failure)) {
            expect(failure.kind).toBe("aborted");
            expect(failure.retryable).toBe(false);
        }
    });
});
