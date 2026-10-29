import { describe, expect, it, vi } from "vitest";

import {
    EvidenceLoadError,
    citationContext,
    disposeEvidenceContent,
    evidenceContentKind,
    isEvidenceMediaType,
} from "./contract";

describe("evidence contract", () => {
    it("accepts only renderable media types", () => {
        expect(isEvidenceMediaType("text/markdown")).toBe(true);
        expect(isEvidenceMediaType("application/pdf")).toBe(true);
        expect(isEvidenceMediaType("text/html")).toBe(false);
        expect(isEvidenceMediaType(null)).toBe(false);
    });

    it("maps descriptors to renderer kinds", () => {
        expect(
            evidenceContentKind({
                media_type: "text/markdown",
                derived_from: null,
            })
        ).toBe("markdown");
        expect(
            evidenceContentKind({
                media_type: "text/csv",
                derived_from: null,
            })
        ).toBe("csv");
        expect(
            evidenceContentKind({
                media_type: "application/json",
                derived_from: null,
            })
        ).toBe("json");
        expect(
            evidenceContentKind({
                media_type: "application/pdf",
                derived_from: null,
            })
        ).toBe("pdf");
        expect(
            evidenceContentKind({
                media_type: "text/plain",
                derived_from: "docx",
            })
        ).toBe("derived");
    });

    it("keeps citation excerpt and locator separate from the external link", () => {
        expect(
            citationContext({
                source: "CRISIL",
                snippet: "7.87% coupon",
                locator: "S1 annexure row",
                url: "https://example.com/report",
            })
        ).toEqual({
            excerpt: "7.87% coupon",
            locator: "S1 annexure row",
            external_url: "https://example.com/report",
            source_label: "CRISIL",
        });
    });

    it("disposes only PDF object URLs", () => {
        const dispose = vi.fn();
        disposeEvidenceContent({
            kind: "pdf",
            url: "blob:local",
            size_bytes: 10,
            dispose,
        });
        disposeEvidenceContent({ kind: "text", text: "hello", truncated: false });
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it("marks transient failures retryable but integrity failures not", () => {
        expect(new EvidenceLoadError("timeout", "slow").retryable).toBe(true);
        expect(new EvidenceLoadError("integrity", "bad hash").retryable).toBe(
            false
        );
    });
});
