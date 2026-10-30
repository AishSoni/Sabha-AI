/**
 * Replay evidence adapter (spec 21).
 *
 * Replay previews resolve only through the published package: a citation's
 * claim_id selects the validated evidence_asset_id, which selects exactly one
 * recorded asset. Bytes come from the asset's immutable public URL and are
 * checked against the recorded size, media type, and SHA-256 before rendering.
 */
import { isApiError } from "@/shared/api/errors";
import { requestBytes } from "@/shared/api/transport";
import {
    EVIDENCE_MAX_BYTES,
    EVIDENCE_MAX_TEXT_CHARACTERS,
    EvidenceLoadError,
    isEvidenceMediaType,
    type EvidenceCitationRef,
    type EvidenceContent,
    type EvidenceDescriptor,
    type EvidenceMediaType,
    type MeetingsEvidenceApi,
} from "../evidence/contract";
import type { ReplayAsset, ReplayClaim } from "./contract";

export interface ReplayEvidenceSession {
    assets: ReplayAsset[];
    claims: ReplayClaim[];
}

export interface ReplayEvidenceDeps {
    fetchBytes?: typeof requestBytes;
    digest?: (bytes: Uint8Array) => Promise<string>;
}

function titleForAsset(asset: ReplayAsset): string {
    const words = asset.asset_id.replace(/[-_]+/g, " ").trim();
    if (!words) return asset.asset_id;
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isDemoAuthoredInput(asset: ReplayAsset): boolean {
    return (
        asset.authored &&
        asset.public_demo &&
        (asset.locator.startsWith("package:private/") ||
            asset.storage_path.startsWith("private/"))
    );
}

function provenanceForAsset(asset: ReplayAsset) {
    const label = isDemoAuthoredInput(asset)
        ? "Demo-authored participant input"
        : asset.authored
          ? "Prepared for this replay"
          : "Retained source material";
    return {
        label,
        source: asset.source,
        captured_at: asset.capture_date,
        rights: asset.rights,
        authored: asset.authored,
        extraction: asset.extraction,
        detail: `Package asset · ${asset.storage_path}`,
    };
}

function isPreviewable(asset: ReplayAsset): boolean {
    return (
        isEvidenceMediaType(asset.media_type) &&
        Boolean(asset.public_url) &&
        asset.size > 0 &&
        asset.size <= EVIDENCE_MAX_BYTES
    );
}

function unavailableReason(asset: ReplayAsset): string | null {
    if (!isEvidenceMediaType(asset.media_type)) {
        return "This asset format cannot be previewed in the app.";
    }
    if (!asset.public_url) return "No recorded public asset URL is available.";
    if (asset.size <= 0) return "The recorded asset is empty.";
    if (asset.size > EVIDENCE_MAX_BYTES) {
        return "This asset exceeds the in-app preview size limit.";
    }
    return null;
}

export function descriptorForAsset(asset: ReplayAsset): EvidenceDescriptor {
    const mediaType: EvidenceMediaType = isEvidenceMediaType(asset.media_type)
        ? asset.media_type
        : "text/plain";
    const reason = unavailableReason(asset);
    return {
        evidence_id: asset.asset_id,
        title: titleForAsset(asset),
        media_type: mediaType,
        size_bytes: asset.size,
        readiness: reason ? "unavailable" : "ready",
        provenance: provenanceForAsset(asset),
        sha256: asset.sha256,
        external_url: /^https?:\/\//i.test(asset.locator)
            ? asset.locator
            : null,
        ...(reason ? { unavailable_reason: reason } : {}),
    };
}

async function defaultDigest(bytes: Uint8Array): Promise<string> {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, "0")
    ).join("");
}

function isCrossOrigin(url: string): boolean {
    if (typeof window === "undefined" || !window.location) return false;
    try {
        return new URL(url).origin !== window.location.origin;
    } catch {
        return false;
    }
}

function requestError(error: unknown, url: string): EvidenceLoadError {
    if (isApiError(error)) {
        if (error.kind === "aborted") {
            return new EvidenceLoadError("aborted", "The preview request was cancelled.", {
                cause: error,
            });
        }
        if (error.kind === "network") {
            const offline =
                typeof navigator !== "undefined" && navigator.onLine === false;
            if (offline) {
                return new EvidenceLoadError(
                    "offline",
                    "You appear to be offline. Reconnect and retry.",
                    { cause: error }
                );
            }
            if (isCrossOrigin(url)) {
                return new EvidenceLoadError(
                    "cors",
                    "The recorded asset could not be read because the storage origin blocked the request.",
                    { cause: error }
                );
            }
            return new EvidenceLoadError("network", "The recorded asset could not be reached.", {
                cause: error,
            });
        }
        if (error.kind === "http") {
            if (error.status === 404 || error.status === 410 || error.status === 503) {
                return new EvidenceLoadError(
                    "unavailable",
                    "The recorded asset is not available.",
                    { cause: error }
                );
            }
            if (error.status === 413) {
                return new EvidenceLoadError("too_large", "The recorded asset is too large.", {
                    cause: error,
                });
            }
            if (error.status === 422) {
                return new EvidenceLoadError(
                    "unsupported",
                    "The recorded asset format is not supported.",
                    { cause: error }
                );
            }
            return new EvidenceLoadError("http", "The recorded asset request failed.", {
                cause: error,
            });
        }
    }
    return new EvidenceLoadError("unknown", "The recorded asset could not be read.", {
        cause: error,
    });
}

function textContent(
    mediaType: EvidenceMediaType,
    text: string
): EvidenceContent {
    const truncated = text.length > EVIDENCE_MAX_TEXT_CHARACTERS;
    const bounded = truncated ? text.slice(0, EVIDENCE_MAX_TEXT_CHARACTERS) : text;
    if (mediaType === "text/markdown") {
        return { kind: "markdown", text: bounded, truncated };
    }
    if (mediaType === "text/csv") {
        return { kind: "csv", text: bounded, truncated };
    }
    if (mediaType === "application/json") {
        return { kind: "json", text: bounded, truncated };
    }
    return { kind: "text", text: bounded, truncated };
}

function pdfContent(bytes: Uint8Array): EvidenceContent {
    const magic = new TextDecoder("ascii").decode(bytes.slice(0, 5));
    if (magic !== "%PDF-") {
        throw new EvidenceLoadError("integrity", "The recorded PDF failed its format check.");
    }
    const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" })
    );
    return {
        kind: "pdf",
        url,
        size_bytes: bytes.byteLength,
        dispose: () => URL.revokeObjectURL(url),
    };
}

export function createReplayEvidence(
    session: ReplayEvidenceSession,
    deps: ReplayEvidenceDeps = {}
): MeetingsEvidenceApi {
    const fetchBytes = deps.fetchBytes ?? requestBytes;
    const digest = deps.digest ?? defaultDigest;
    const assetsById = new Map(session.assets.map((asset) => [asset.asset_id, asset]));
    const claimsById = new Map(session.claims.map((claim) => [claim.claim_id, claim]));

    return {
        async list() {
            return session.assets.map(descriptorForAsset);
        },

        async resolveCitation(citation: EvidenceCitationRef) {
            if (!citation.claim_id) return null;
            const claim = claimsById.get(citation.claim_id);
            if (!claim?.evidence_asset_id) return null;
            const asset = assetsById.get(claim.evidence_asset_id);
            if (!asset) return null;
            return descriptorForAsset(asset);
        },

        async load(descriptor, { signal }) {
            const asset = assetsById.get(descriptor.evidence_id);
            if (!asset) {
                throw new EvidenceLoadError(
                    "unavailable",
                    "The recorded asset is no longer part of this replay package."
                );
            }
            const reason = unavailableReason(asset);
            if (reason) {
                throw new EvidenceLoadError("unavailable", reason);
            }
            if (!isEvidenceMediaType(asset.media_type)) {
                throw new EvidenceLoadError(
                    "unsupported",
                    "The recorded asset format is not supported."
                );
            }

            let response: Awaited<ReturnType<typeof requestBytes>>;
            try {
                response = await fetchBytes(asset.public_url, {
                    headers: { Accept: asset.media_type },
                    signal,
                });
            } catch (error) {
                throw requestError(error, asset.public_url);
            }

            const size = response.bytes.byteLength;
            if (size > EVIDENCE_MAX_BYTES) {
                throw new EvidenceLoadError("too_large", "The recorded asset is too large.");
            }
            if (size !== asset.size) {
                throw new EvidenceLoadError(
                    "integrity",
                    "The recorded asset size does not match the package manifest."
                );
            }

            const declaredType = response.contentType?.split(";")[0]?.trim().toLowerCase();
            if (declaredType && declaredType !== asset.media_type) {
                throw new EvidenceLoadError(
                    "wrong_type",
                    "The recorded asset was served with an unexpected media type."
                );
            }

            let actualHash: string;
            try {
                actualHash = await digest(response.bytes);
            } catch (error) {
                throw new EvidenceLoadError(
                    "integrity",
                    "The recorded asset could not be verified.",
                    { cause: error }
                );
            }
            if (actualHash.toLowerCase() !== asset.sha256.toLowerCase()) {
                throw new EvidenceLoadError(
                    "integrity",
                    "The recorded asset does not match the package manifest hash."
                );
            }

            if (asset.media_type === "application/pdf") {
                return pdfContent(response.bytes);
            }
            const text = new TextDecoder("utf-8").decode(response.bytes);
            return textContent(asset.media_type, text);
        },
    };
}
