import { describe, expect, it, vi } from "vitest";
import {
    WORKSPACE_LIMITS,
    type WorkspacePublishedAsset,
    type WorkspaceSample,
} from "@/features/demo-workspace";
import { SampleSourceError, verifySampleSource } from "./sample-source";

const SAMPLE: WorkspaceSample = {
    sampleId: "sample-shared-fact-sheet",
    assetId: "shared-fact-sheet",
    fileName: "shared-fact-sheet.md",
    mediaType: "text/markdown",
    sizeBytes: 11,
    sha256: "b".repeat(64),
    role: "shared-research",
    destinationKinds: ["meeting", "stack"],
    description: "The prepared issuer fact sheet.",
    accessibleLabel: "Upload the prepared issuer fact sheet",
    provenance: "demo-authored",
    rightsStatus: "approved-for-upload",
    approvedAt: "2026-10-31",
    previewMode: "inline",
    previewNote: null,
    scenarioId: "ready-after-indexing",
    preparedChunkCount: 4,
    failureMessage: null,
};

const ASSET: WorkspacePublishedAsset = {
    assetId: SAMPLE.assetId,
    publicUrl: "https://assets.example.test/shared-fact-sheet.md",
    mediaType: SAMPLE.mediaType,
    sha256: SAMPLE.sha256,
    sizeBytes: SAMPLE.sizeBytes,
};

function bytes(value = "prepared md") {
    return new TextEncoder().encode(value);
}

function response(
    body = bytes(),
    contentType: string | null = "text/markdown"
) {
    return {
        bytes: body,
        contentType,
        contentLength: body.byteLength,
        fileName: null,
    };
}

async function failure(
    sample: WorkspaceSample,
    asset: WorkspacePublishedAsset | undefined,
    deps: Parameters<typeof verifySampleSource>[2]
): Promise<SampleSourceError> {
    try {
        await verifySampleSource(sample, asset, deps);
    } catch (cause) {
        expect(cause).toBeInstanceOf(SampleSourceError);
        return cause as SampleSourceError;
    }
    throw new Error("Expected sample verification to fail.");
}

describe("practice sample source verification", () => {
    it("loads public bytes with only the approved media type and verifies the hash", async () => {
        const fetchBytes = vi.fn(async () => response());
        const digest = vi.fn(async () => SAMPLE.sha256);

        await verifySampleSource(SAMPLE, ASSET, { fetchBytes, digest });

        expect(fetchBytes).toHaveBeenCalledTimes(1);
        expect(fetchBytes).toHaveBeenCalledWith(ASSET.publicUrl, {
            headers: { Accept: "text/markdown" },
        });
        expect(digest).toHaveBeenCalledWith(bytes());
    });

    it("rejects a sample that is missing from the published package", async () => {
        const error = await failure(SAMPLE, undefined, {});
        expect(error.reason).toBe("missing_asset");
    });

    it("rejects published metadata that no longer matches the approved sample", async () => {
        const error = await failure(
            SAMPLE,
            { ...ASSET, sha256: "c".repeat(64) },
            {}
        );
        expect(error.reason).toBe("metadata_mismatch");
    });

    it("rejects credential-bearing and non-http source URLs", async () => {
        for (const publicUrl of [
            "javascript:alert(1)",
            "https://user:secret@assets.example.test/shared.md",
        ]) {
            const error = await failure(SAMPLE, { ...ASSET, publicUrl }, {});
            expect(error.reason).toBe("unsafe_url");
        }
    });

    it("rejects samples beyond the in-app byte limit before fetching", async () => {
        const source = {
            ...SAMPLE,
            sizeBytes: WORKSPACE_LIMITS.sampleBytes + 1,
        };
        const fetchBytes = vi.fn(async () => response());
        const error = await failure(
            source,
            { ...ASSET, sizeBytes: source.sizeBytes },
            { fetchBytes }
        );
        expect(error.reason).toBe("too_large");
        expect(fetchBytes).not.toHaveBeenCalled();
    });

    it("rejects a failed source load as unreachable", async () => {
        const error = await failure(SAMPLE, ASSET, {
            fetchBytes: vi.fn(async () => {
                throw new Error("offline");
            }),
        });
        expect(error.reason).toBe("unreachable");
    });

    it("rejects size, media-type, and hash mismatches", async () => {
        const short = await failure(SAMPLE, ASSET, {
            fetchBytes: vi.fn(async () => response(bytes("short"))),
            digest: vi.fn(async () => SAMPLE.sha256),
        });
        expect(short.reason).toBe("integrity");

        const wrongType = await failure(SAMPLE, ASSET, {
            fetchBytes: vi.fn(async () => response(bytes(), "text/html")),
            digest: vi.fn(async () => SAMPLE.sha256),
        });
        expect(wrongType.reason).toBe("wrong_type");

        const wrongHash = await failure(SAMPLE, ASSET, {
            fetchBytes: vi.fn(async () => response()),
            digest: vi.fn(async () => "c".repeat(64)),
        });
        expect(wrongHash.reason).toBe("integrity");
    });

    it("accepts a content type with parameters", async () => {
        const fetchBytes = vi.fn(async () =>
            response(bytes(), "text/markdown; charset=utf-8")
        );
        await expect(
            verifySampleSource(SAMPLE, ASSET, {
                fetchBytes,
                digest: async () => SAMPLE.sha256,
            })
        ).resolves.toBeUndefined();
    });
});
