import { describe, expect, it } from "vitest";

import { boundPreviewText } from "./bounded-text";
import { EVIDENCE_RENDER_TEXT_LIMIT } from "./contract";

describe("boundPreviewText", () => {
    it("does not report omission at the exact render boundary", () => {
        const text = "a".repeat(EVIDENCE_RENDER_TEXT_LIMIT);
        expect(boundPreviewText(text, false)).toEqual({
            text,
            omitted: false,
        });
    });

    it("reports omission and clips one character past the boundary", () => {
        const text = "a".repeat(EVIDENCE_RENDER_TEXT_LIMIT + 1);
        const preview = boundPreviewText(text, false);
        expect(preview.text).toHaveLength(EVIDENCE_RENDER_TEXT_LIMIT);
        expect(preview.omitted).toBe(true);
    });

    it("reports omission whenever the loader truncated the source", () => {
        expect(boundPreviewText("short retained text", true)).toEqual({
            text: "short retained text",
            omitted: true,
        });
    });
});
