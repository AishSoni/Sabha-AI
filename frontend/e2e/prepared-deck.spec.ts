import { test, expect } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

const MEETING_ID = "a0000000-0000-4000-8000-000000000001";
const FOLLOW_UP =
    "Portfolio Analyst, assume a fictional three-year mandate that requires an executable price, yield, and liquidity assessment. What can you conclude from this record?";

test.describe("prepared turn deck", () => {
    test("plays the four replies in visitor order with one You follow-up", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await serveRecordedAssets(page);
        await page.goto(`/demo/meetings/${MEETING_ID}`);
        await expect(
            page.getByRole("heading", {
                name: /Review HDFC Ltd's 7\.87% 2022 debenture/,
            })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Who speaks next?")).toBeVisible();

        const close = page.getByRole("button", { name: "Close meeting" });
        await expect(close).toBeDisabled();
        await expect(page.getByText(/Director/)).toHaveCount(0);
        await expect(close).toHaveAttribute(
            "aria-label",
            /Play all four replies and send the follow-up/
        );

        await page.getByRole("button", { name: "Send question" }).click();
        await expect(page.getByText(FOLLOW_UP).first()).toBeVisible();

        await page
            .getByRole("button", { name: "Downside challenge" })
            .click();
        await expect(
            page.getByRole("button", { name: "Show full response" })
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Skip to prepared result" })
        ).toHaveCount(0);
        await expect(
            page.getByText(/I disagree with treating AAA\/Stable/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Mandate review" }).click();
        await expect(
            page.getByText(/The mandate cannot be completed from this record/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Committee alignment" }).click();
        await expect(
            page.getByText(/The committee can align on a bounded checklist/).first()
        ).toBeVisible({ timeout: 30_000 });

        await expect(
            page.getByRole("button", { name: "Credit Analyst opening facts" })
        ).toHaveCount(0);
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
        await page.getByRole("button", { name: "Archive meeting" }).click();
        await expect(page.getByText("Meeting archived")).toBeVisible({
            timeout: 30_000,
        });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
