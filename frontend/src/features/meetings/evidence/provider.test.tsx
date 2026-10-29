import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
    EvidenceContent,
    EvidenceDescriptor,
    EvidenceLoadError,
    MeetingsEvidenceApi,
} from "./contract";
import { EvidencePreviewHost } from "./host";
import { EvidencePreviewProvider } from "./provider";
import { EvidenceTrigger } from "./trigger";

const descriptor: EvidenceDescriptor = {
    evidence_id: "live:doc-1:rev-1",
    title: "mda.md",
    media_type: "text/markdown",
    size_bytes: 20,
    readiness: "ready",
    provenance: { label: "Uploaded document", detail: "Revision 1 · ready" },
};

function adapter(
    load: MeetingsEvidenceApi["load"]
): MeetingsEvidenceApi {
    return {
        list: async () => [descriptor],
        resolveCitation: async () => descriptor,
        load,
    };
}

function Harness({
    api,
    epoch = "live",
}: {
    api: MeetingsEvidenceApi;
    epoch?: string;
}) {
    return (
        <EvidencePreviewProvider adapter={api} epoch={epoch}>
            <EvidenceTrigger
                descriptor={descriptor}
                citation={{
                    source: "Knowledge",
                    snippet: "the cited excerpt",
                    locator: "page 2",
                }}
            />
            <EvidencePreviewHost />
        </EvidencePreviewProvider>
    );
}

describe("EvidencePreviewProvider", () => {
    it("opens the one dialog with citation context and loaded content", async () => {
        const content: EvidenceContent = {
            kind: "markdown",
            text: "Evidence body",
            truncated: false,
        };
        const load = vi.fn(async () => content);
        render(<Harness api={adapter(load)} />);

        fireEvent.click(
            screen.getByRole("button", { name: "Preview evidence: mda.md" })
        );

        expect(await screen.findByText("Evidence body")).toBeInTheDocument();
        expect(screen.getByText("Locator: page 2")).toBeInTheDocument();
        expect(screen.getByText(/the cited excerpt/)).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "mda.md" })
        ).toBeInTheDocument();
    });

    it("aborts the in-flight load when the dialog closes", async () => {
        const load = vi.fn(
            (
                _descriptor: EvidenceDescriptor,
                { signal }: { signal: AbortSignal }
            ) =>
                new Promise<EvidenceContent>((_resolve, reject) => {
                    signal.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError"))
                    );
                })
        );
        render(<Harness api={adapter(load)} />);
        fireEvent.click(
            screen.getByRole("button", { name: "Preview evidence: mda.md" })
        );
        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        const signal = load.mock.calls[0][1].signal;
        await waitFor(() => expect(signal.aborted).toBe(true));
    });

    it("retries a retryable failure", async () => {
        const load = vi
            .fn<MeetingsEvidenceApi["load"]>()
            .mockRejectedValueOnce(new EvidenceLoadError("http", "Server error"))
            .mockResolvedValueOnce({
                kind: "markdown",
                text: "Recovered body",
                truncated: false,
            });
        render(<Harness api={adapter(load)} />);
        fireEvent.click(
            screen.getByRole("button", { name: "Preview evidence: mda.md" })
        );

        expect(
            await screen.findByText("The evidence could not be loaded")
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
        expect(await screen.findByText("Recovered body")).toBeInTheDocument();
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("closes and aborts when the runtime epoch changes", async () => {
        const load = vi.fn(
            (
                _descriptor: EvidenceDescriptor,
                { signal }: { signal: AbortSignal }
            ) =>
                new Promise<EvidenceContent>((_resolve, reject) => {
                    signal.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError"))
                    );
                })
        );
        const api = adapter(load);
        const { rerender } = render(<Harness api={api} epoch="checkpoint-1" />);
        fireEvent.click(
            screen.getByRole("button", { name: "Preview evidence: mda.md" })
        );
        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

        rerender(<Harness api={api} epoch="checkpoint-2" />);

        const signal = load.mock.calls[0][1].signal;
        await waitFor(() => expect(signal.aborted).toBe(true));
        await waitFor(() =>
            expect(
                screen.queryByRole("heading", { name: "mda.md" })
            ).not.toBeInTheDocument()
        );
    });
});
