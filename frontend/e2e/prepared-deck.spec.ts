import { test, expect } from "./support/demo-test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

const MEETING_ID = "a0000000-0000-4000-8000-000000000001";
const FOLLOW_UP =
    "Portfolio Analyst, assume a fictional three-year mandate that requires an executable price, yield, and liquidity assessment. What can you conclude from this record?";

const OPENING = {
    mira: "Ask Mira, Credit Analyst for an opening view",
    arjun: "Ask Arjun, Downside Reviewer for an opening view",
    leena: "Ask Leena, Portfolio Analyst for an opening view",
} as const;

test.describe("prepared turn deck", () => {
    test("plays opening views in any order, then alignment, follow-up, and outcome", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await serveRecordedAssets(page);
        await page.goto(`/demo/meetings/${MEETING_ID}`);
        await expect(
            page.getByRole("heading", {
                name: /A HDFC Bond Review Demo/,
            })
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByRole("group", { name: "Meeting controls" })
        ).toBeVisible();

        const close = page.getByRole("button", { name: "Close meeting" });
        await expect(close).toBeDisabled();
        await expect(page.getByText(/Director/)).toHaveCount(0);
        await expect(close).toHaveAttribute(
            "aria-label",
            /Choose who speaks next to begin/
        );

        // The fixed follow-up and the alignment turn are locked until the
        // policy accepts the opening views.
        await expect(
            page.getByRole("button", { name: "Send question" })
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Expand" })
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: /Committee alignment/ })
        ).toHaveCount(0);

        await page.getByRole("button", { name: OPENING.arjun }).click();
        await expect(
            page.getByRole("button", { name: "Show full response" })
        ).toBeVisible();
        await page.getByRole("button", { name: "Show full response" }).click();
        await expect(
            page.getByText(/I disagree with treating AAA\/Stable/).first()
        ).toBeVisible({ timeout: 30_000 });

        await page.getByRole("button", { name: OPENING.mira }).click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });

        await page.getByRole("button", { name: OPENING.leena }).click();
        await expect(
            page.getByText(/The mandate cannot be completed from this record/).first()
        ).toBeVisible({ timeout: 30_000 });

        await expect(close).toBeDisabled();
        await expect(close).toHaveAttribute(
            "aria-label",
            /Finish the discussion before closing/
        );

        await page
            .getByRole("button", { name: /Committee alignment/ })
            .click();
        await expect(
            page.getByText(/The committee can align on a bounded checklist/).first()
        ).toBeVisible({ timeout: 30_000 });

        await expect(
            page.getByRole("button", { name: "Send question" })
        ).toBeVisible();
        await expect(page.getByText(FOLLOW_UP)).toBeVisible();
        await page.getByRole("button", { name: "Expand" }).click();
        await page.getByRole("button", { name: "Send question" }).click();
        await expect(
            page.locator(
                '[data-testid="message"][data-message-id="a0000000-0000-4000-8000-000000000404"]'
            )
        ).toBeVisible({ timeout: 30_000 });
        await expect(close).toBeEnabled();

        await close.click();
        await expect(
            page.getByRole("heading", { name: "Close Meeting" })
        ).toBeVisible();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });

        const outcome = page.getByTestId("demo-outcome");
        await expect(outcome).toBeVisible();
        await expect(
            outcome.getByRole("heading", {
                name: "What this discussion produced",
            })
        ).toBeVisible();
        await expect(outcome.getByText("Different mandates")).toBeVisible();
        await expect(
            outcome.getByText("Inspectable evidence")
        ).toBeVisible();
        await expect(
            outcome.getByRole("heading", { name: "Research checklist" })
        ).toBeVisible();
        await expect(outcome.getByText(/Archiving is optional/)).toBeVisible();
        await expect(page.getByText(/Severity \d\/5/)).toHaveCount(0);
        await expect(page.getByText(/Strength \d\/5/)).toHaveCount(0);

        await page.getByRole("button", { name: "Archive meeting" }).click();
        await expect(page.getByText("Meeting archived")).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByTestId("demo-outcome").getByText(/This record is archived/)
        ).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
