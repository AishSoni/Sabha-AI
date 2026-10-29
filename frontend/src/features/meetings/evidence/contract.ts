/**
 * Shared evidence-preview contract (spec 21).
 *
 * The dialog, loader, and renderers consume only these runtime-neutral types.
 * Live and replay compositions supply an adapter that resolves descriptors and
 * transports bytes; neither runtime's own types leak in here.
 */

export const EVIDENCE_MEDIA_TYPES = [
    "text/markdown",
    "text/plain",
    "text/csv",
    "application/json",
    "application/pdf",
] as const;

export type EvidenceMediaType = (typeof EVIDENCE_MEDIA_TYPES)[number];

export const EVIDENCE_MAX_BYTES = 50 * 1024 * 1024;
export const EVIDENCE_MAX_TEXT_CHARACTERS = 2_000_000;
export const EVIDENCE_LOAD_TIMEOUT_MS = 15_000;

export type EvidenceReadiness = "ready" | "unavailable";
export type EvidenceDerivedFrom = "docx" | "xlsx";

/**
 * Provenance is display-only. Adapters translate live revision metadata or
 * replay asset metadata into these neutral fields.
 */
export interface EvidenceProvenance {
    /** Human label, e.g. "Uploaded document" or "Retained source material". */
    label: string;
    source?: string | null;
    captured_at?: string | null;
    rights?: string | null;
    authored?: boolean | null;
    extraction?: string | null;
    /** Extra identity line, e.g. "Revision 2 · ready" or "Package asset". */
    detail?: string | null;
}

export interface EvidenceDescriptor {
    /** Stable identity the adapter can resolve again on load. */
    evidence_id: string;
    title: string;
    media_type: EvidenceMediaType;
    size_bytes: number | null;
    readiness: EvidenceReadiness;
    provenance: EvidenceProvenance;
    sha256?: string | null;
    /** Present when the preview is bounded derived text rather than the original file. */
    derived_from?: EvidenceDerivedFrom | null;
    /** Honest reason shown when readiness is unavailable. */
    unavailable_reason?: string | null;
}

/**
 * The citation identity shared by committed messages and streaming events.
 * Live citations use document/revision/chunk fields; replay citations use
 * claim_id/locator. External citations may carry only source/title/url/snippet.
 */
export interface EvidenceCitationRef {
    source?: string | null;
    title?: string | null;
    url?: string | null;
    snippet?: string | null;
    claim_id?: string | null;
    locator?: string | null;
    document_id?: string | null;
    revision_id?: string | null;
    chunk_id?: string | null;
    chunk_index?: number | null;
    page_number?: number | null;
}

export interface EvidenceCitationContext {
    excerpt?: string | null;
    locator?: string | null;
    /** Secondary action only; never auto-fetched and never used as fallback. */
    external_url?: string | null;
    source_label?: string | null;
}

export type EvidenceTextKind = "markdown" | "text" | "csv" | "json" | "derived";

export interface EvidenceTextContent {
    kind: EvidenceTextKind;
    text: string;
    truncated: boolean;
    derived_from?: EvidenceDerivedFrom | null;
}

export interface EvidencePdfContent {
    kind: "pdf";
    /** Local blob URL owned by the loader/host; revoked on close or replacement. */
    url: string;
    size_bytes: number;
    dispose: () => void;
}

export type EvidenceContent = EvidenceTextContent | EvidencePdfContent;

export interface EvidenceLoadOptions {
    signal: AbortSignal;
}

export type EvidenceViewState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; content: EvidenceContent }
    | { status: "error"; error: EvidenceLoadError };

export interface MeetingsEvidenceApi {
    /** Every previewable item for the current scope/run. */
    list(): Promise<EvidenceDescriptor[]>;
    /** Resolve a citation to its exact retained revision or package asset. */
    resolveCitation(
        citation: EvidenceCitationRef
    ): Promise<EvidenceDescriptor | null>;
    /** Load bytes for a descriptor. The caller owns abort and cleanup. */
    load(
        descriptor: EvidenceDescriptor,
        options: EvidenceLoadOptions
    ): Promise<EvidenceContent>;
}

export type EvidenceErrorKind =
    | "aborted"
    | "timeout"
    | "network"
    | "offline"
    | "cors"
    | "http"
    | "too_large"
    | "wrong_type"
    | "integrity"
    | "parser"
    | "unsupported"
    | "unavailable"
    | "unknown";

const RETRYABLE: ReadonlySet<EvidenceErrorKind> = new Set<EvidenceErrorKind>([
    "timeout",
    "network",
    "offline",
    "cors",
    "http",
    "unknown",
]);

export class EvidenceLoadError extends Error {
    readonly kind: EvidenceErrorKind;
    readonly retryable: boolean;

    constructor(
        kind: EvidenceErrorKind,
        message: string,
        options?: { retryable?: boolean; cause?: unknown }
    ) {
        super(message, { cause: options?.cause });
        this.name = "EvidenceLoadError";
        this.kind = kind;
        this.retryable = options?.retryable ?? RETRYABLE.has(kind);
    }
}

export function isEvidenceLoadError(error: unknown): error is EvidenceLoadError {
    return error instanceof EvidenceLoadError;
}

export function isEvidenceMediaType(
    value: string | null | undefined
): value is EvidenceMediaType {
    return (
        typeof value === "string" &&
        (EVIDENCE_MEDIA_TYPES as readonly string[]).includes(value)
    );
}

export function evidenceContentKind(
    descriptor: Pick<EvidenceDescriptor, "media_type" | "derived_from">
): EvidenceTextKind | "pdf" {
    if (descriptor.media_type === "application/pdf") {
        return "pdf";
    }
    if (descriptor.derived_from) {
        return "derived";
    }
    switch (descriptor.media_type) {
        case "text/markdown":
            return "markdown";
        case "text/csv":
            return "csv";
        case "application/json":
            return "json";
        default:
            return "text";
    }
}

export function citationContext(
    citation: EvidenceCitationRef | null | undefined
): EvidenceCitationContext {
    if (!citation) {
        return {};
    }
    return {
        excerpt: citation.snippet ?? null,
        locator: citation.locator ?? null,
        external_url: citation.url ?? null,
        source_label: citation.source ?? null,
    };
}

export function disposeEvidenceContent(content: EvidenceContent | null): void {
    if (content && content.kind === "pdf") {
        content.dispose();
    }
}
