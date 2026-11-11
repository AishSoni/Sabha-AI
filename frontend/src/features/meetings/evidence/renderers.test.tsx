import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    EVIDENCE_RENDER_TEXT_LIMIT,
    EvidenceDescriptor,
} from "./contract";
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

    it("shows an accessible completeness notice when Markdown was truncated", () => {
        render(
            <EvidenceContentRenderer
                descriptor={descriptor}
                content={{
                    kind: "markdown",
                    text: "# Retained heading\n\nRetained body.",
                    truncated: true,
                }}
            />
        );
        const notice = screen.getByRole("status");
        expect(notice).toHaveTextContent(
            "Preview truncated; the retained source may contain more."
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            screen.getByRole("heading", { name: "Retained heading" })
        ).toBeInTheDocument();
    });

    it("does not claim truncation for complete Markdown", () => {
        render(
            <EvidenceContentRenderer
                descriptor={descriptor}
                content={{
                    kind: "markdown",
                    text: "Complete markdown.",
                    truncated: false,
                }}
            />
        );
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("does not claim truncation for Markdown exactly at the render boundary", () => {
        render(
            <EvidenceContentRenderer
                descriptor={descriptor}
                content={{
                    kind: "markdown",
                    text: "a".repeat(EVIDENCE_RENDER_TEXT_LIMIT),
                    truncated: false,
                }}
            />
        );
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("bounds over-limit Markdown and hides clipped content", () => {
        const tail = "CLIPPED_TAIL_MARKER";
        const { container } = render(
            <EvidenceContentRenderer
                descriptor={descriptor}
                content={{
                    kind: "markdown",
                    text: "a".repeat(EVIDENCE_RENDER_TEXT_LIMIT) + tail,
                    truncated: false,
                }}
            />
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "Preview truncated; the retained source may contain more."
        );
        expect(container.textContent).not.toContain(tail);
    });

    it("bounds over-limit preformatted text and reports the omission", () => {
        render(
            <EvidenceContentRenderer
                descriptor={descriptor}
                content={{
                    kind: "text",
                    text: "a".repeat(EVIDENCE_RENDER_TEXT_LIMIT + 1),
                    truncated: false,
                }}
            />
        );
        const notice = screen.getByRole("status");
        expect(notice).toHaveTextContent(
            "Preview truncated; the retained source may contain more."
        );
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("does not claim truncation for complete preformatted text", () => {
        render(
            <EvidenceContentRenderer
                descriptor={descriptor}
                content={{
                    kind: "json",
                    text: '{"complete":true}',
                    truncated: false,
                }}
            />
        );
        expect(screen.queryByRole("status")).toBeNull();
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

    it("reports only the CSV limits that were actually applied", () => {
        const rows = Array.from({ length: 201 }, (_, index) => `r${index}`);
        render(
            <EvidenceContentRenderer
                descriptor={{ ...descriptor, media_type: "text/csv" }}
                content={{
                    kind: "csv",
                    text: rows.join("\n"),
                    truncated: false,
                }}
            />
        );
        const notice = screen.getByRole("status");
        expect(notice).toHaveTextContent("Only the first 200 rows are shown.");
        expect(notice).not.toHaveTextContent("columns");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("does not claim CSV truncation at exactly 200 rows", () => {
        const rows = Array.from({ length: 200 }, (_, index) => `r${index}`);
        render(
            <EvidenceContentRenderer
                descriptor={{ ...descriptor, media_type: "text/csv" }}
                content={{
                    kind: "csv",
                    text: rows.join("\n"),
                    truncated: false,
                }}
            />
        );
        expect(screen.queryByRole("status")).toBeNull();
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
            rowLimit: false,
            columnLimit: false,
            cellLimit: false,
        });
    });

    it("does not report a row limit at exactly 200 rows", () => {
        const rows = Array.from({ length: 200 }, (_, index) => `r${index}`);
        expect(parseCsvBounded(rows.join("\n"))).toMatchObject({
            truncated: false,
            rowLimit: false,
            columnLimit: false,
            cellLimit: false,
        });
    });

    it("does not report a row limit for a trailing newline", () => {
        const rows = Array.from({ length: 200 }, (_, index) => `r${index}`);
        const table = parseCsvBounded(rows.join("\n") + "\n");
        expect(table?.rows).toHaveLength(200);
        expect(table).toMatchObject({
            truncated: false,
            rowLimit: false,
        });
    });

    it("reports a row limit when a 201st row would be omitted", () => {
        const rows = Array.from({ length: 201 }, (_, index) => `r${index}`);
        const table = parseCsvBounded(rows.join("\n"));
        expect(table?.rows).toHaveLength(200);
        expect(table).toMatchObject({
            truncated: true,
            rowLimit: true,
            columnLimit: false,
            cellLimit: false,
        });
    });

    it("does not report a column limit at exactly 20 columns", () => {
        const row = Array.from({ length: 20 }, (_, index) => `c${index}`);
        const table = parseCsvBounded(row.join(","));
        expect(table).toMatchObject({
            truncated: false,
            rowLimit: false,
            columnLimit: false,
            cellLimit: false,
        });
        expect(table?.rows[0]).toHaveLength(20);
    });

    it("reports a column limit when a 21st column would be omitted", () => {
        const row = Array.from({ length: 21 }, (_, index) => `c${index}`);
        const table = parseCsvBounded(row.join(","));
        expect(table?.rows[0]).toHaveLength(20);
        expect(table).toMatchObject({
            truncated: true,
            rowLimit: false,
            columnLimit: true,
            cellLimit: false,
        });
    });

    it("does not report a cell limit at exactly 500 characters", () => {
        const table = parseCsvBounded("x".repeat(500) + ",y");
        expect(table?.rows[0][0]).toHaveLength(500);
        expect(table).toMatchObject({
            truncated: false,
            rowLimit: false,
            columnLimit: false,
            cellLimit: false,
        });
    });

    it("reports a cell limit when a cell is shortened", () => {
        const table = parseCsvBounded("x".repeat(501) + ",y");
        expect(table?.rows[0][0]).toHaveLength(500);
        expect(table).toMatchObject({
            truncated: true,
            rowLimit: false,
            columnLimit: false,
            cellLimit: true,
        });
    });
});
