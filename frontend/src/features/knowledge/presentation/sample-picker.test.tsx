import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSample } from "@/features/demo-workspace";
import { SamplePicker } from "./sample-picker";

const SHARED: WorkspaceSample = {
    sampleId: "sample-shared",
    assetId: "shared",
    fileName: "shared-fact-sheet.md",
    mediaType: "text/markdown",
    sizeBytes: 1350,
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

const MANDATE: WorkspaceSample = {
    ...SHARED,
    sampleId: "sample-mandate",
    assetId: "mandate",
    fileName: "portfolio-mandate.md",
    sizeBytes: 669,
    role: "mandate-material",
    description: "The fictional mandate limits used by the portfolio role.",
    accessibleLabel: "Upload the portfolio mandate",
    previewMode: "unsupported",
    previewNote: "Markdown preview is not enabled for this sample.",
    preparedChunkCount: 3,
};

function Harness({
    added = [],
    onConfirm = vi.fn(async () => ({ ok: true as const })),
}: {
    added?: string[];
    onConfirm?: (
        sample: WorkspaceSample
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Add document
            </button>
            <SamplePicker
                open={open}
                onOpenChange={setOpen}
                samples={[SHARED, MANDATE]}
                destinationLabel="Credit evidence stack"
                audienceLabel="Who can retrieve: The Credit Analyst and The Downside Reviewer."
                isAlreadyAdded={(sample) => added.includes(sample.sampleId)}
                onConfirm={onConfirm}
                renderPreviewAction={(sample) => (
                    <button type="button">Preview {sample.fileName}</button>
                )}
            />
        </>
    );
}

describe("sample picker", () => {
    it("offers only supplied samples with format, size, destination, and audience", () => {
        render(<Harness />);

        expect(
            screen.getByRole("dialog", { name: "Add a sample" })
        ).toBeTruthy();
        expect(screen.getByText("shared-fact-sheet.md")).toBeTruthy();
        expect(screen.getByText("portfolio-mandate.md")).toBeTruthy();
        expect(screen.getAllByText("MARKDOWN")).toHaveLength(2);
        expect(screen.getByText("1 KB")).toBeTruthy();
        expect(screen.getByText(/Credit evidence stack/)).toBeTruthy();
        expect(
            screen.getByText(/The Credit Analyst and The Downside Reviewer/)
        ).toBeTruthy();
        expect(
            screen.getByText(/Your own files are never opened/)
        ).toBeTruthy();
        expect(document.querySelector('input[type="file"]')).toBeNull();
        expect(
            screen.getByRole("button", { name: /Preview shared-fact-sheet.md/ })
        ).toBeTruthy();
    });

    it("shows an honest unsupported-preview explanation", () => {
        render(<Harness />);
        fireEvent.click(
            screen.getByRole("radio", { name: /portfolio-mandate.md/ })
        );
        expect(
            screen.getByText(
                "Preview unavailable: Markdown preview is not enabled for this sample."
            )
        ).toBeTruthy();
    });

    it("marks an already added sample blocked and selects the next available sample", () => {
        render(<Harness added={[SHARED.sampleId]} />);

        const blocked = screen.getByRole("radio", {
            name: /shared-fact-sheet.md/,
        }) as HTMLInputElement;
        expect(blocked.disabled).toBe(true);
        expect(screen.getByText("Already added")).toBeTruthy();
        expect(
            (screen.getByRole("radio", {
                name: /portfolio-mandate.md/,
            }) as HTMLInputElement).checked
        ).toBe(true);
        expect(
            (screen.getByRole("button", { name: "Add sample" }) as HTMLButtonElement)
                .disabled
        ).toBe(false);
    });

    it("requires a sample selection and disables adding when every sample is present", () => {
        render(<Harness added={[SHARED.sampleId, MANDATE.sampleId]} />);
        expect(
            (screen.getByRole("button", { name: "Add sample" }) as HTMLButtonElement)
                .disabled
        ).toBe(true);
    });

    it("confirms the selected sample once and closes the dialog", async () => {
        let resolve!: (value: { ok: true }) => void;
        const onConfirm = vi.fn(
            () =>
                new Promise<{ ok: true }>((done) => {
                    resolve = done;
                })
        );
        render(<Harness onConfirm={onConfirm} />);

        fireEvent.click(screen.getByRole("button", { name: "Add sample" }));
        expect(onConfirm).toHaveBeenCalledWith(SHARED);
        expect(
            (screen.getByRole("button", { name: "Adding sample" }) as HTMLButtonElement)
                .disabled
        ).toBe(true);
        resolve({ ok: true });

        await waitFor(() =>
            expect(screen.queryByRole("dialog")).toBeNull()
        );
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("keeps the dialog open and announces a failed local add", async () => {
        const onConfirm = vi.fn(async () => ({
            ok: false as const,
            error: "The sample is already added in this destination.",
        }));
        render(<Harness onConfirm={onConfirm} />);

        fireEvent.click(screen.getByRole("button", { name: "Add sample" }));

        await waitFor(() =>
            expect(
                screen.getByText(
                    "The sample is already added in this destination."
                )
            ).toBeTruthy()
        );
        expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("cancels without adding a sample", () => {
        const onConfirm = vi.fn(async () => ({ ok: true as const }));
        render(<Harness onConfirm={onConfirm} />);

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onConfirm).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
