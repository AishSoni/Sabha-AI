import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvidenceDescriptor } from "./contract";
import { EvidenceContentRenderer, parseCsvBounded } from "./renderers";

const descriptor: EvidenceDescriptor = {
    evidence_id: "asset-1",
    title: "evidence.md",
    media_type: "text/markdown",
    size_bytes: 100,
    readiness: "ready",
    provenance: { label: "Retained source material" },
};

describe("EvidenceContentRenderer", () => {
    it("renders GFM markdown read-only", () => {
        render(
            <EvidenceContentRenderer
                descriptor={descriptor}
                content={{
                    kind: "markdown",
                    text: "# Heading\n\n| A | B |\n|---|---|\n| 1 | 2 |",
                    truncated: false,
                }}
            />
        );
        expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
        expect(screen.getByRole("table")).toBeInTheDocument();
    });

    it("strips raw HTML and scripts", () => {
        const { container } = render(
            <EvidenceContentRenderer
                descriptor={descriptor}
                content={{
                    kind: "markdown",
                    text: '<script>alert("x")</script><b>bold</b>\n\nSafe text.',
                    truncated: false,
                }}
            />
        );
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector("b")).toBeNull();
        expect(screen.getByText(/Safe text/)).toBeInTheDocument();
    });

    it("rejects dangerous link schemes and never fetches remote images", () => {
        const { container } = render(
            <EvidenceContentRenderer
                descriptor={descriptor}
                content={{
                    kind: "markdown",
                    text: "[bad](javascript:alert(1)) ![chart](https://example.com/chart.png)",
                    truncated: false,
                }}
            />
        );
        expect(container.querySelector("img")).toBeNull();
        for (const anchor of Array.from(container.querySelectorAll("a"))) {
            expect(anchor.getAttribute("href") ?? "").not.toContain("javascript:");
        }
        expect(screen.getByText("[Image omitted: chart]")).toBeInTheDocument();
    });

    it("renders CSV as bounded text cells, including formula-looking values", () => {
        const { container } = render(
            <EvidenceContentRenderer
                descriptor={{ ...descriptor, media_type: "text/csv" }}
                content={{
                    kind: "csv",
                    text: "name,value\n=1+1,2",
                    truncated: false,
                }}
            />
        );
        expect(container.querySelector("table")).not.toBeNull();
        expect(screen.getByText("=1+1")).toBeInTheDocument();
        expect(container.querySelector("input")).toBeNull();
    });

    it("falls back to plain text for oversized CSV", () => {
        render(
            <EvidenceContentRenderer
                descriptor={{ ...descriptor, media_type: "text/csv" }}
                content={{
                    kind: "csv",
                    text: "a".repeat(200_001),
                    truncated: false,
                }}
            />
        );
        expect(
            screen.getByText(/CSV preview shown as plain text/)
        ).toBeInTheDocument();
    });

    it("labels derived Office text honestly", () => {
        render(
            <EvidenceContentRenderer
                descriptor={{
                    ...descriptor,
                    media_type: "text/plain",
                    derived_from: "xlsx",
                }}
                content={{
                    kind: "derived",
                    text: "Revenue 100",
                    truncated: true,
                    derived_from: "xlsx",
                }}
            />
        );
        expect(
            screen.getByText(/Formatting, formulas, charts, macros/)
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Preview truncated/)
        ).toBeInTheDocument();
    });

    it("renders a PDF only from a local blob URL", () => {
        const { container } = render(
            <EvidenceContentRenderer
                descriptor={{ ...descriptor, media_type: "application/pdf" }}
                content={{
                    kind: "pdf",
                    url: "blob:local-pdf",
                    size_bytes: 10,
                    dispose: () => {},
                }}
            />
        );
        const frame = container.querySelector("iframe");
        expect(frame).not.toBeNull();
        expect(frame?.getAttribute("src")).toBe("blob:local-pdf");
    });
});

describe("parseCsvBounded", () => {
    it("handles quoted cells and newlines", () => {
        expect(parseCsvBounded('a,"b,c"\n"line\nbreak",d')).toEqual({
            rows: [
                ["a", "b,c"],
                ["line\nbreak", "d"],
            ],
            truncated: false,
        });
    });

    it("caps rows, columns, and cell length", () => {
        const table = parseCsvBounded("x".repeat(600) + "," + "y");
        expect(table?.truncated).toBe(true);
        expect(table?.rows[0][0]).toHaveLength(500);
    });
});
