import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CitationsBlock } from "./CitationsBlock";

describe("CitationsBlock", () => {
    it("shows the readable excerpt and exact locator", () => {
        render(
            <CitationsBlock
                citations={[
                    {
                        source: "CRISIL rating rationale",
                        title: "CRISIL Rating Rationale, 31 July 2020",
                        snippet:
                            "CRISIL's annexure row for ISIN INE001A07RW5 lists a 7.87% coupon.",
                        claim_id: "C1",
                        locator: "S1 annexure row for ISIN INE001A07RW5",
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /1 Source/ }));

        expect(
            screen.getByText("Locator: S1 annexure row for ISIN INE001A07RW5")
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "CRISIL's annexure row for ISIN INE001A07RW5 lists a 7.87% coupon."
            )
        ).toBeInTheDocument();
    });

    it('renders the shared preview action next to each citation label', () => {
        const seen: string[] = [];
        render(
            <CitationsBlock
                citations={[
                    {
                        source: 'knowledge',
                        title: 'hdfc-fy20-mda.md',
                        document_id: 'doc-1',
                        revision_id: 'rev-2',
                        chunk_id: 'chunk-3',
                    },
                ]}
                renderPreviewAction={(citation) => {
                    seen.push(`${citation.document_id}:${citation.revision_id}`);
                    return <button type="button">Preview evidence</button>;
                }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /1 Source/ }));

        expect(seen).toEqual(['doc-1:rev-2']);
        expect(screen.getByRole('button', { name: 'Preview evidence' })).toBeInTheDocument();
    });

    it('does not invent a preview action when the citation is unresolvable', () => {
        render(
            <CitationsBlock
                citations={[
                    {
                        source: 'External article',
                        title: 'A public article',
                        url: 'https://example.com/article',
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /1 Source/ }));

        expect(screen.queryByRole('button', { name: 'Preview evidence' })).toBeNull();
        expect(screen.getByRole('link', { name: /A public article/ })).toBeInTheDocument();
    });
});
