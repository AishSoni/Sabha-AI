/**
 * Bounded verification of one approved sample (spec-25).
 *
 * The loader reads immutable public package bytes without credentials and
 * checks the declared size, media type, and SHA-256 before the picker accepts
 * the selection. It does not parse, index, or store the bytes.
 */
import { requestBytes } from "@/shared/api/transport";
import {
    WORKSPACE_LIMITS,
    type WorkspacePublishedAsset,
    type WorkspaceSample,
} from "@/features/demo-workspace/contract";

export type SampleSourceFailure =
    | "missing_asset"
    | "metadata_mismatch"
    | "unsafe_url"
    | "too_large"
    | "unreachable"
    | "wrong_type"
    | "integrity";

export class SampleSourceError extends Error {
    readonly reason: SampleSourceFailure;

    constructor(reason: SampleSourceFailure, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "SampleSourceError";
        this.reason = reason;
    }
}

export interface SampleSourceDeps {
    fetchBytes?: typeof requestBytes;
    digest?: (bytes: Uint8Array) => Promise<string>;
}

async function defaultDigest(bytes: Uint8Array): Promise<string> {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, "0")
    ).join("");
}

function publicUrl(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch (cause) {
        throw new SampleSourceError(
            "unsafe_url",
            "The prepared sample has no valid public source.",
            { cause }
        );
    }
    if (
        (url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username ||
        url.password
    ) {
        throw new SampleSourceError(
            "unsafe_url",
            "The prepared sample source is not a credential-free public URL."
        );
    }
    return url;
}

export async function verifySampleSource(
    sample: WorkspaceSample,
    asset: WorkspacePublishedAsset | undefined,
    deps: SampleSourceDeps = {}
): Promise<void> {
    if (!asset) {
        throw new SampleSourceError(
            "missing_asset",
            "The prepared sample is not part of this published package."
        );
    }
    if (
        asset.assetId !== sample.assetId ||
        asset.mediaType !== sample.mediaType ||
        asset.sizeBytes !== sample.sizeBytes ||
        asset.sha256 !== sample.sha256
    ) {
        throw new SampleSourceError(
            "metadata_mismatch",
            "The prepared sample no longer matches the published asset metadata."
        );
    }
    const url = publicUrl(asset.publicUrl);
    if (sample.sizeBytes > WORKSPACE_LIMITS.sampleBytes) {
        throw new SampleSourceError(
            "too_large",
            "The prepared sample exceeds the in-app size limit."
        );
    }

    const fetchBytes = deps.fetchBytes ?? requestBytes;
    let response: Awaited<ReturnType<typeof requestBytes>>;
    try {
        response = await fetchBytes(url.toString(), {
            headers: { Accept: sample.mediaType },
        });
    } catch (cause) {
        throw new SampleSourceError(
            "unreachable",
            "The prepared sample source could not be loaded.",
            { cause }
        );
    }

    const size = response.bytes.byteLength;
    if (size > WORKSPACE_LIMITS.sampleBytes) {
        throw new SampleSourceError(
            "too_large",
            "The prepared sample exceeds the in-app size limit."
        );
    }
    if (size !== sample.sizeBytes) {
        throw new SampleSourceError(
            "integrity",
            "The prepared sample size does not match its approved record."
        );
    }
    const declaredType = response.contentType?.split(";")[0]?.trim().toLowerCase();
    if (declaredType && declaredType !== sample.mediaType.toLowerCase()) {
        throw new SampleSourceError(
            "wrong_type",
            "The prepared sample was served with an unexpected media type."
        );
    }

    let actualHash: string;
    try {
        actualHash = await (deps.digest ?? defaultDigest)(response.bytes);
    } catch (cause) {
        throw new SampleSourceError(
            "integrity",
            "The prepared sample could not be verified.",
            { cause }
        );
    }
    if (actualHash.toLowerCase() !== sample.sha256.toLowerCase()) {
        throw new SampleSourceError(
            "integrity",
            "The prepared sample does not match its approved SHA-256."
        );
    }
}
