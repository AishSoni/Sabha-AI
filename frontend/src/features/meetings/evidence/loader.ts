/**
 * Shared bounded evidence loader.
 *
 * Adapters own transport (same-origin revision route vs recorded public
 * asset). This module owns the cross-runtime guarantees: readiness, byte and
 * text ceilings, timeout, abort, and content-kind validation.
 */

import {
    EVIDENCE_LOAD_TIMEOUT_MS,
    EVIDENCE_MAX_BYTES,
    EVIDENCE_MAX_TEXT_CHARACTERS,
    EvidenceContent,
    EvidenceDescriptor,
    EvidenceLoadError,
    MeetingsEvidenceApi,
    evidenceContentKind,
    isEvidenceLoadError,
} from "./contract";

export interface LoadEvidenceContentOptions {
    signal: AbortSignal;
    timeoutMs?: number;
    maxBytes?: number;
    maxTextCharacters?: number;
}

function isAbortError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
    );
}

function validateContent(
    descriptor: EvidenceDescriptor,
    content: EvidenceContent,
    maxBytes: number,
    maxTextCharacters: number
): EvidenceContent {
    const expected = evidenceContentKind(descriptor);

    if (expected === "pdf") {
        if (content.kind !== "pdf") {
            throw new EvidenceLoadError(
                "wrong_type",
                "The evidence response was not a PDF."
            );
        }
        if (!content.url.startsWith("blob:")) {
            content.dispose();
            throw new EvidenceLoadError(
                "integrity",
                "The PDF preview was not created from local bytes."
            );
        }
        if (content.size_bytes > maxBytes) {
            content.dispose();
            throw new EvidenceLoadError(
                "too_large",
                "The evidence file is larger than the preview limit."
            );
        }
        return content;
    }

    if (content.kind === "pdf") {
        content.dispose();
        throw new EvidenceLoadError(
            "wrong_type",
            "The evidence response was not readable text."
        );
    }
    if (content.kind !== expected) {
        throw new EvidenceLoadError(
            "wrong_type",
            `The evidence response was ${content.kind}, expected ${expected}.`
        );
    }
    if (content.text.length > maxTextCharacters) {
        throw new EvidenceLoadError(
            "too_large",
            "The evidence text is larger than the preview limit."
        );
    }
    return content;
}

export async function loadEvidenceContent(
    adapter: MeetingsEvidenceApi,
    descriptor: EvidenceDescriptor,
    options: LoadEvidenceContentOptions
): Promise<EvidenceContent> {
    const {
        signal,
        timeoutMs = EVIDENCE_LOAD_TIMEOUT_MS,
        maxBytes = EVIDENCE_MAX_BYTES,
        maxTextCharacters = EVIDENCE_MAX_TEXT_CHARACTERS,
    } = options;

    if (signal.aborted) {
        throw new EvidenceLoadError("aborted", "The preview request was cancelled.");
    }
    if (descriptor.readiness !== "ready") {
        throw new EvidenceLoadError(
            "unavailable",
            descriptor.unavailable_reason ??
                "This evidence is no longer available."
        );
    }
    if (descriptor.size_bytes !== null && descriptor.size_bytes > maxBytes) {
        throw new EvidenceLoadError(
            "too_large",
            "The evidence file is larger than the preview limit."
        );
    }

    const controller = new AbortController();
    let timedOut = false;
    const forwardAbort = () => controller.abort();
    signal.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    try {
        const content = await adapter.load(descriptor, {
            signal: controller.signal,
        });

        if (timedOut) {
            if (content.kind === "pdf") content.dispose();
            throw new EvidenceLoadError(
                "timeout",
                "The evidence preview timed out."
            );
        }
        if (signal.aborted) {
            if (content.kind === "pdf") content.dispose();
            throw new EvidenceLoadError(
                "aborted",
                "The preview request was cancelled."
            );
        }

        return validateContent(descriptor, content, maxBytes, maxTextCharacters);
    } catch (error) {
        if (isEvidenceLoadError(error)) {
            throw error;
        }
        if (timedOut) {
            throw new EvidenceLoadError(
                "timeout",
                "The evidence preview timed out.",
                { cause: error }
            );
        }
        if (signal.aborted || isAbortError(error)) {
            throw new EvidenceLoadError(
                "aborted",
                "The preview request was cancelled.",
                { cause: error }
            );
        }
        throw new EvidenceLoadError(
            "unknown",
            "The evidence preview could not be loaded.",
            { cause: error }
        );
    } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", forwardAbort);
    }
}
