import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSample } from "@/features/demo-workspace";
import type { LocalDocumentsAdapter } from "../local/use-local-documents";
import { DemoMeetingDocuments } from "./demo-meeting-documents";

const SAMPLE: WorkspaceSample = {
    sampleId: "sample-shared",
    assetId: "shared",
    fileName: "shared-fact-sheet.md",
    mediaType: "text/markdown",
    sizeBytes: 1345,
    sha256: "b".repeat(64),
    role: "shared-research",
    destinationKinds: ["meeting", "stack"],
    description: "The issuer fact sheet used by the demo board.",
    accessibleLabel: "Upload the issuer fact sheet",
    provenance: "demo-authored",
    rightsStatus: "approved-for-upload",
    approvedAt: "2026-10-31",
    previewMode: "inline",
    previewNote: null,
    scenarioId: "ready-after-indexing",
    preparedChunkCount: 4,
    failureMessage: null,
};

const baseAdapter: LocalDocumentsAdapter = {
    documents: [],
    counts: { total: 0, ready: 0 },
    samples: [SAMPLE],
    isLoading: false,
    isError: false,
    uploading: false,
    localError: null,
    removingId: null,
    addSample: vi.fn(async () => ({ ok: true as const })),
    retryDocument: vi.fn(),
    removeDocument: vi.fn(),
    isAlreadyAdded: vi.fn(() => false),
    sampleForDocument: vi.fn(() => SAMPLE),
    participantCanRetrieve: vi.fn(() => true),
};

const useLocalDocuments = vi.fn(() => baseAdapter);

vi.mock("../local/use-local-documents", () => ({
    useLocalDocuments: () => useLocalDocuments(),
}));

vi.mock("@/features/demo-workspace", () => ({
    useDemoWorkspace: () => ({
        expanded: true,
    }),
}));

beforeEach(() => {
    useLocalDocuments.mockReturnValue(baseAdapter);
});

describe("DemoMeetingDocuments", () => {
    it("shows one browser-local inventory with queued and ready states", () => {
        useLocalDocuments.mockReturnValue({
            ...baseAdapter,
            documents: [
                {
                    id: "doc-pending",
                    file_name: "downside-worksheet.md",
                    file_type: "md",
                    file_size_bytes: 601,
                    status: "pending",
                    chunk_count: 0,
                    operation_id: "op-1",
                },
                {
                    id: "doc-ready",
                    file_name: "shared-fact-sheet.md",
                    file_type: "md",
                    file_size_bytes: 1345,
                    status: "ready",
                    chunk_count: 4,
                    operation_id: "op-2",
                },
            ],
            counts: { total: 2, ready: 1 },
        });

        render(
            <DemoMeetingDocuments
                meetingId="meeting-1"
                mode="room"
                renderPreviewAction={(sample) => (
                    <button type="button">Preview {sample.fileName}</button>
                )}
            />
        );

        expect(screen.getByText("Added to this demo")).toBeTruthy();
        expect(screen.getByText("Queued")).toBeTruthy();
        expect(screen.getByText("Ready (4 chunks)")).toBeTruthy();
        expect(
            screen.getByRole("button", {
                name: "Preview shared-fact-sheet.md",
            })
        ).toBeTruthy();
        expect(screen.getAllByText(/Added in this browser/)).toHaveLength(2);
    });

    it("retries and removes the same document identity", () => {
        const retryDocument = vi.fn();
        const removeDocument = vi.fn();
        useLocalDocuments.mockReturnValue({
            ...baseAdapter,
            documents: [
                {
                    id: "doc-failed",
                    file_name: "downside-worksheet.md",
                    file_type: "md",
                    file_size_bytes: 601,
                    status: "failed",
                    chunk_count: 0,
                    operation_id: "op-failed",
                    error_message: "Simulated ingestion stopped before indexing.",
                },
            ],
            retryDocument,
            removeDocument,
        });

        render(
            <DemoMeetingDocuments meetingId="meeting-1" mode="stack" />
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Retry downside-worksheet.md",
            })
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: "Remove downside-worksheet.md",
            })
        );

        expect(retryDocument).toHaveBeenCalledWith("op-failed");
        expect(removeDocument).toHaveBeenCalledWith(
            expect.objectContaining({ id: "doc-failed" })
        );
    });

    it("offers the approved-sample picker in setup without an OS file input", () => {
        render(
            <DemoMeetingDocuments meetingId="meeting-1" mode="setup" />
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Add approved sample" })
        );

        expect(
            screen.getByRole("dialog", { name: "Add a sample" })
        ).toBeTruthy();
        expect(screen.getByText("shared-fact-sheet.md")).toBeTruthy();
        expect(document.querySelector('input[type="file"]')).toBeNull();
    });

    it("stays out of the room when no meeting sample exists", () => {
        render(
            <DemoMeetingDocuments meetingId="meeting-1" mode="room" />
        );

        expect(screen.queryByText("Added to this demo")).toBeNull();
    });
});
