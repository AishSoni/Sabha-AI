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
});
