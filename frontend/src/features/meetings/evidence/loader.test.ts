import { describe, expect, it, vi } from "vitest";

import {
    EvidenceContent,
    EvidenceDescriptor,
    EvidenceLoadError,
    MeetingsEvidenceApi,
} from "./contract";
import { loadEvidenceContent } from "./loader";

function descriptor(
    overrides: Partial<EvidenceDescriptor> = {}
): EvidenceDescriptor {
    return {
        evidence_id: "evidence-1",
        title: "note.md",
        media_type: "text/markdown",
        size_bytes: 12,
        readiness: "ready",
        provenance: { label: "Uploaded document" },
        ...overrides,
    };
}

function adapter(load: MeetingsEvidenceApi["load"]): MeetingsEvidenceApi {
    return {
        list: async () => [],
        resolveCitation: async () => null,
        load,
    };
}

describe("loadEvidenceContent", () => {
    it("loads bounded text through the adapter", async () => {
        const content: EvidenceContent = {
            kind: "markdown",
            text: "# Title",
            truncated: false,
        };
        const load = vi.fn(async () => content);
        await expect(
            loadEvidenceContent(adapter(load), descriptor(), {
                signal: new AbortController().signal,
            })
        ).resolves.toBe(content);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("rejects before transport when the descriptor is unavailable", async () => {
        const load = vi.fn();
        await expect(
            loadEvidenceContent(
                adapter(load),
                descriptor({
                    readiness: "unavailable",
                    unavailable_reason: "Revision revoked",
                }),
                { signal: new AbortController().signal }
            )
        ).rejects.toMatchObject({ kind: "unavailable", message: "Revision revoked" });
        expect(load).not.toHaveBeenCalled();
    });

    it("rejects before transport when the recorded size exceeds the limit", async () => {
        const load = vi.fn();
        await expect(
            loadEvidenceContent(
                adapter(load),
                descriptor({ size_bytes: 11 }),
                { signal: new AbortController().signal, maxBytes: 10 }
            )
        ).rejects.toMatchObject({ kind: "too_large" });
        expect(load).not.toHaveBeenCalled();
    });

    it("aborts a load when the caller signal is aborted", async () => {
        const controller = new AbortController();
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
        const pending = loadEvidenceContent(adapter(load), descriptor(), {
            signal: controller.signal,
        });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ kind: "aborted" });
    });

    it("times out a stalled adapter", async () => {
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
        await expect(
            loadEvidenceContent(adapter(load), descriptor(), {
                signal: new AbortController().signal,
                timeoutMs: 5,
            })
        ).rejects.toMatchObject({ kind: "timeout" });
    });

    it("rejects a response whose content kind does not match the descriptor", async () => {
        await expect(
            loadEvidenceContent(
                adapter(async () => ({
                    kind: "text",
                    text: "plain",
                    truncated: false,
                })),
                descriptor(),
                { signal: new AbortController().signal }
            )
        ).rejects.toMatchObject({ kind: "wrong_type" });
    });

    it("requires derived Office previews to be labelled derived", async () => {
        await expect(
            loadEvidenceContent(
                adapter(async () => ({
                    kind: "text",
                    text: "plain",
                    truncated: false,
                })),
                descriptor({
                    media_type: "text/plain",
                    derived_from: "docx",
                }),
                { signal: new AbortController().signal }
            )
        ).rejects.toMatchObject({ kind: "wrong_type" });
    });

    it("rejects a PDF that is not a local blob and disposes it", async () => {
        const dispose = vi.fn();
        await expect(
            loadEvidenceContent(
                adapter(async () => ({
                    kind: "pdf",
                    url: "https://example.com/file.pdf",
                    size_bytes: 10,
                    dispose,
                })),
                descriptor({ media_type: "application/pdf" }),
                { signal: new AbortController().signal }
            )
        ).rejects.toBeInstanceOf(EvidenceLoadError);
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});
