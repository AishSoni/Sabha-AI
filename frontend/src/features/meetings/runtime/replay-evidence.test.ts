import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";
import { EvidenceLoadError } from "../evidence/contract";
import type { ReplayAsset, ReplayClaim } from "./contract";
import {
    createReplayEvidence,
    descriptorForAsset,
    isDemoAuthoredInput,
} from "./replay-evidence";

const HASH = "a".repeat(64);

function makeAsset(overrides: Partial<ReplayAsset> = {}): ReplayAsset {
    return {
        asset_id: "crisil-annexure",
        storage_path: "evidence/crisil-annexure.md",
        media_type: "text/markdown",
        sha256: HASH,
        size: 8,
        locator: "https://www.crisil.com/rationale",
        public_url: "https://assets.example/crisil-annexure.md",
        source: "CRISIL Rating Rationale",
        capture_date: "2020-07-31",
        rights: "Short attributed transcription",
        authored: false,
        public_demo: true,
        extraction: "offline transcription",
        ...overrides,
    };
}

function makeClaim(overrides: Partial<ReplayClaim> = {}): ReplayClaim {
    return {
        claim_id: "C1",
        kind: "fact",
        text: "The rating is AA+.",
        evidence_asset_id: "crisil-annexure",
        locator: "S1 annexure row",
        excerpt: "AA+",
        source_url: "https://www.crisil.com/rationale",
        source_title: "CRISIL Rating Rationale",
        capture_date: "2026-10-16",
        ...overrides,
    };
}

function bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

describe("replay evidence descriptors", () => {
    it("lists every package asset with honest provenance labels", async () => {
        const retained = makeAsset();
        const prepared = makeAsset({
            asset_id: "shared-fact-sheet",
            storage_path: "shared/hdfc-v007-shared-fact-sheet.md",
            authored: true,
            source: "Prepared for this replay",
        });
        const demo = makeAsset({
            asset_id: "credit-evidence",
            storage_path: "private/credit-evidence.md",
            authored: true,
            source: "Demo input",
        });
        const evidence = createReplayEvidence({
            assets: [retained, prepared, demo],
            claims: [],
        });

        const descriptors = await evidence.list();

        expect(descriptors).toHaveLength(3);
        expect(descriptors.map((item) => item.evidence_id)).toEqual([
            "crisil-annexure",
            "shared-fact-sheet",
            "credit-evidence",
        ]);
        expect(descriptors[0]?.provenance.label).toBe("Retained source material");
        expect(descriptors[1]?.provenance.label).toBe("Prepared for this replay");
        expect(descriptors[2]?.provenance.label).toBe(
            "Demo-authored participant input"
        );
        expect(descriptors.every((item) => item.readiness === "ready")).toBe(true);
        expect(isDemoAuthoredInput(demo)).toBe(true);
        expect(isDemoAuthoredInput(prepared)).toBe(false);
    });

    it("marks unsupported assets unavailable instead of dropping them", async () => {
        const asset = makeAsset({ media_type: "application/msword" });
        const descriptor = descriptorForAsset(asset);

        expect(descriptor.readiness).toBe("unavailable");
        expect(descriptor.unavailable_reason).toMatch(/cannot be previewed/);
    });
});

describe("replay evidence citation resolution", () => {
    const asset = makeAsset();
    const evidence = createReplayEvidence({
        assets: [asset],
        claims: [makeClaim()],
    });

    it("resolves claim_id to the validated evidence asset", async () => {
        const descriptor = await evidence.resolveCitation({ claim_id: "C1" });

        expect(descriptor?.evidence_id).toBe("crisil-annexure");
        expect(descriptor?.readiness).toBe("ready");
    });

    it("never falls back to a title, URL, or array position", async () => {
        await expect(
            evidence.resolveCitation({
                title: "CRISIL Rating Rationale",
                url: "https://www.crisil.com/rationale",
            })
        ).resolves.toBeNull();
        await expect(
            evidence.resolveCitation({ claim_id: "C99" })
        ).resolves.toBeNull();
    });

    it("returns null when the claim points at a missing asset", async () => {
        const dangling = createReplayEvidence({
            assets: [asset],
            claims: [makeClaim({ claim_id: "C2", evidence_asset_id: "missing" })],
        });

        await expect(
            dangling.resolveCitation({ claim_id: "C2" })
        ).resolves.toBeNull();
    });
});

describe("replay evidence loading", () => {
    it("requests only the recorded public URL and returns markdown", async () => {
        const asset = makeAsset({ size: 6 });
        const fetchBytes = vi.fn(
            async (_path: string, _init?: { headers?: Record<string, string> }) => ({
                bytes: bytes("# Fact"),
                contentType: "text/markdown; charset=utf-8",
                contentLength: 6,
                fileName: null,
            })
        );
        const evidence = createReplayEvidence(
            { assets: [asset], claims: [] },
            { fetchBytes, digest: async () => HASH }
        );

        const content = await evidence.load(descriptorForAsset(asset), {
            signal: new AbortController().signal,
        });

        expect(fetchBytes).toHaveBeenCalledTimes(1);
        expect(fetchBytes.mock.calls[0]?.[0]).toBe(asset.public_url);
        expect(fetchBytes.mock.calls[0]?.[1]).toMatchObject({
            headers: { Accept: "text/markdown" },
        });
        expect(content).toMatchObject({
            kind: "markdown",
            text: "# Fact",
            truncated: false,
        });
    });

    it("rejects a response with the wrong media type", async () => {
        const asset = makeAsset({ size: 6 });
        const evidence = createReplayEvidence(
            { assets: [asset], claims: [] },
            {
                fetchBytes: async () => ({
                    bytes: bytes("# Fact"),
                    contentType: "text/html",
                    contentLength: 6,
                    fileName: null,
                }),
                digest: async () => HASH,
            }
        );

        const failure = await evidence
            .load(descriptorForAsset(asset), { signal: new AbortController().signal })
            .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(EvidenceLoadError);
        expect((failure as EvidenceLoadError).kind).toBe("wrong_type");
    });

    it("rejects a response whose size does not match the manifest", async () => {
        const asset = makeAsset({ size: 99 });
        const evidence = createReplayEvidence(
            { assets: [asset], claims: [] },
            {
                fetchBytes: async () => ({
                    bytes: bytes("# Fact"),
                    contentType: "text/markdown",
                    contentLength: 6,
                    fileName: null,
                }),
                digest: async () => HASH,
            }
        );

        const failure = await evidence
            .load(descriptorForAsset(asset), { signal: new AbortController().signal })
            .catch((error: unknown) => error);

        expect((failure as EvidenceLoadError).kind).toBe("integrity");
    });

    it("rejects a response whose SHA-256 does not match the manifest", async () => {
        const asset = makeAsset({ size: 6 });
        const evidence = createReplayEvidence(
            { assets: [asset], claims: [] },
            {
                fetchBytes: async () => ({
                    bytes: bytes("# Fact"),
                    contentType: "text/markdown",
                    contentLength: 6,
                    fileName: null,
                }),
                digest: async () => "b".repeat(64),
            }
        );

        const failure = await evidence
            .load(descriptorForAsset(asset), { signal: new AbortController().signal })
            .catch((error: unknown) => error);

        expect((failure as EvidenceLoadError).kind).toBe("integrity");
    });

    it("maps an aborted request to the aborted kind", async () => {
        const asset = makeAsset({ size: 6 });
        const evidence = createReplayEvidence(
            { assets: [asset], claims: [] },
            {
                fetchBytes: async () => {
                    throw new ApiError("aborted", null, "cancelled");
                },
                digest: async () => HASH,
            }
        );

        const failure = await evidence
            .load(descriptorForAsset(asset), { signal: new AbortController().signal })
            .catch((error: unknown) => error);

        expect((failure as EvidenceLoadError).kind).toBe("aborted");
        expect((failure as EvidenceLoadError).retryable).toBe(false);
    });

    it("renders PDF bytes through a local blob URL and revokes it on dispose", async () => {
        const asset = makeAsset({
            media_type: "application/pdf",
            storage_path: "evidence/rationale.pdf",
            size: 8,
        });
        const createObjectURL = vi
            .spyOn(URL, "createObjectURL")
            .mockReturnValue("blob:pdf");
        const revokeObjectURL = vi
            .spyOn(URL, "revokeObjectURL")
            .mockImplementation(() => undefined);
        const evidence = createReplayEvidence(
            { assets: [asset], claims: [] },
            {
                fetchBytes: async () => ({
                    bytes: bytes("%PDF-1.4"),
                    contentType: "application/pdf",
                    contentLength: 8,
                    fileName: null,
                }),
                digest: async () => HASH,
            }
        );

        const content = await evidence.load(descriptorForAsset(asset), {
            signal: new AbortController().signal,
        });

        expect(content.kind).toBe("pdf");
        if (content.kind !== "pdf") throw new Error("expected pdf");
        expect(content.url).toBe("blob:pdf");
        content.dispose();
        expect(createObjectURL).toHaveBeenCalled();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:pdf");
    });
});
