import { EVIDENCE_RENDER_TEXT_LIMIT } from "./contract";

export interface BoundedPreviewText {
    text: string;
    omitted: boolean;
}

/**
 * Bound display text without claiming truncation at an exact boundary.
 * Loader truncation always means omitted content, even if the retained text is
 * shorter than the render limit.
 */
export function boundPreviewText(
    text: string,
    loaderTruncated: boolean
): BoundedPreviewText {
    const bounded = text.slice(0, EVIDENCE_RENDER_TEXT_LIMIT);
    return {
        text: bounded,
        omitted: loaderTruncated || bounded.length < text.length,
    };
}
