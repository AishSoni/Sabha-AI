import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecordedExamplesView, type RecordedExampleView } from "./recorded-examples";

const EXAMPLE: RecordedExampleView = {
    claimId: "C10",
    sampleId: "sample-shared-fact-sheet",
    sampleFileName: "hdfc-v007-shared-fact-sheet.md",
    text: "The meeting record contains no executable price or yield.",
    locator: "Shared fact sheet, What is not established",
    excerpt: "No executable price, yield, or secondary-market liquidity",
    sourceTitle: "Shared fact sheet",
};

describe("RecordedExamplesView", () => {
    it("labels the link as a recorded example and repeats the honest boundary", () => {
        render(<RecordedExamplesView examples={[EXAMPLE]} />);

        expect(
            screen.getByText("Recorded example using the prepared input")
        ).toBeInTheDocument();
        expect(
            screen.getByText(/not a fresh retrieval against your practice edits/i)
        ).toBeInTheDocument();
        expect(screen.getByText(EXAMPLE.text)).toBeInTheDocument();
        expect(screen.getByText(/Claim C10/)).toBeInTheDocument();
    });

    it("offers the supplied preview action only for each recorded example", () => {
        const renderPreview = vi.fn(() => <button type="button">Preview</button>);
        render(
            <RecordedExamplesView
                examples={[EXAMPLE]}
                renderPreviewAction={renderPreview}
            />
        );

        expect(renderPreview).toHaveBeenCalledWith(EXAMPLE);
        expect(
            screen.getByRole("button", { name: "Preview" })
        ).toBeInTheDocument();
    });

    it("renders nothing when no validated mapping exists", () => {
        const { container } = render(<RecordedExamplesView examples={[]} />);

        expect(container).toBeEmptyDOMElement();
    });
});
