import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeDocumentView } from "./contract";
import { DocumentPanelView } from "./document-panel";

const DOCUMENTS: KnowledgeDocumentView[] = [
    {
        id: "doc-ready",
        file_name: "credit-evidence.md",
        file_type: "md",
        file_size_bytes: 534,
        status: "ready",
        chunk_count: 2,
        operation_id: "operation-ready",
        error_message: null,
    },
    {
        id: "doc-failed",
        file_name: "downside-worksheet.md",
        file_type: "md",
        file_size_bytes: 603,
        status: "failed",
        chunk_count: 0,
        operation_id: "operation-failed",
        error_message: "Prepared simulation stopped before indexing.",
    },
    {
        id: "doc-queued",
        file_name: "shared-fact-sheet.md",
        file_type: "md",
        file_size_bytes: 1350,
        status: "pending",
        chunk_count: 0,
        operation_id: "operation-queued",
        error_message: null,
    },
];

function baseProps() {
    return {
        scopeLabel: "stack" as const,
        documents: DOCUMENTS,
        isLoading: false,
        isError: false,
        uploading: false,
        onRetry: vi.fn(),
        onDelete: vi.fn(),
    };
}

describe("shared document panel", () => {
    it("keeps the native file chooser and accepted extensions for the live adapter", () => {
        const onUploadFile = vi.fn();
        const { container } = render(
            <DocumentPanelView
                {...baseProps()}
                onUploadFile={onUploadFile}
            />
        );

        const input = container.querySelector(
            'input[type="file"]'
        ) as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.accept).toBe(".pdf,.docx,.xlsx,.csv,.txt,.md");

        const file = new File(["prepared"], "notes.md", {
            type: "text/markdown",
        });
        fireEvent.change(input, { target: { files: [file] } });
        expect(onUploadFile).toHaveBeenCalledWith(file);
    });

    it("replaces the native chooser when the demo supplies a picker action", () => {
        const { container } = render(
            <DocumentPanelView
                {...baseProps()}
                onUploadFile={vi.fn()}
                uploadAction={<button type="button">Add approved sample</button>}
            />
        );

        expect(container.querySelector('input[type="file"]')).toBeNull();
        expect(
            screen.getByRole("button", { name: "Add approved sample" })
        ).toBeTruthy();
    });

    it("renders one shared vocabulary for readiness, failure, queueing, retry, and removal", () => {
        const onRetry = vi.fn();
        const onDelete = vi.fn();
        render(
            <DocumentPanelView
                {...baseProps()}
                onRetry={onRetry}
                onDelete={onDelete}
                renderPreviewAction={(document) => (
                    <button type="button">Preview {document.file_name}</button>
                )}
            />
        );

        expect(screen.getByText("Ready (2 chunks)")).toBeTruthy();
        expect(screen.getByText("Failed")).toBeTruthy();
        expect(screen.getByText("Queued")).toBeTruthy();
        expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(
            3
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Retry downside-worksheet.md" })
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Retry shared-fact-sheet.md" })
        );
        expect(onRetry).toHaveBeenNthCalledWith(1, "operation-failed");
        expect(onRetry).toHaveBeenNthCalledWith(2, "operation-queued");

        fireEvent.click(
            screen.getByRole("button", { name: "Delete credit-evidence.md" })
        );
        expect(onDelete).toHaveBeenCalledWith(DOCUMENTS[0]);
    });

    it("uses practice-specific empty copy without promising personal uploads", () => {
        render(
            <DocumentPanelView
                {...baseProps()}
                documents={[]}
                uploadAction={<button type="button">Add approved sample</button>}
                emptyMessage="No prepared documents in this stack."
            />
        );
        expect(
            screen.getByText("No prepared documents in this stack.")
        ).toBeTruthy();
        expect(screen.queryByText(/Upload a PDF/)).toBeNull();
    });
});
