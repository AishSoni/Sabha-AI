import { test, expect } from "@playwright/test";

test.describe("guided bond journey", () => {
    test("walks the prepared HDFC replay through archive", async ({ page }) => {
        const liveMutations: string[] = [];
        page.on("request", (request) => {
            const url = request.url();
            if (
                url.includes("/api/meetings") &&
                !url.includes("/api/replay") &&
                request.method() !== "GET"
            ) {
                liveMutations.push(`${request.method()} ${url}`);
            }
        });

        await page.goto("/");
        await page.evaluate(() => window.localStorage.clear());
        await page.goto("/demo");

        await expect(
            page.getByRole("heading", { name: /Prepared board/ })
        ).toBeVisible();
        await expect(page.getByText("Guided replay").first()).toBeVisible();
        await expect(page.getByText(/Information as of 31 July 2020/).first()).toBeVisible();

        const knowledge = page.locator("summary").filter({ hasText: "Knowledge assignments" });
        await expect(knowledge).toHaveCount(3);
        for (let index = 0; index < 3; index += 1) {
            await knowledge.nth(index).click();
        }
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page).toHaveURL(/\/demo\/new$/);

        await expect(
            page.getByText(/Prepared preset — editing is disabled/)
        ).toBeVisible();
        await page.getByRole("button", { name: "Create recorded meeting" }).click();
        await expect(page.getByText("Recorded intake ready")).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+$/);

        await page.getByRole("button", { name: "Ask the Credit Analyst" }).click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: /5 Sources/ }).first().click();
        await expect(
            page.getByText(/CRISIL Rating Rationale/i).first()
        ).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();

        await page.getByRole("button", { name: "Ask the Downside Reviewer" }).click();
        await expect(
            page.getByText(/I disagree with treating AAA\/Stable as sufficient comfort/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByRole("tab", { name: /Disagreements 1/ })
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("tab", { name: "Shared Docs" }).click();
        await expect(
            page.getByText("hdfc-v007-shared-fact-sheet.md")
        ).toBeVisible();
        await expect(
            page.getByText(/credit-evidence|downside-worksheet|portfolio-mandate/)
        ).toHaveCount(0);
        await page.getByRole("tab", { name: "Chat" }).click();
        await page.getByRole("button", { name: "Continue" }).click();

        await page.getByRole("button", { name: /Send prepared follow-up/ }).click();
        await page.getByRole("button", { name: "Ask the Portfolio Analyst" }).click();
        await expect(
            page.getByText(/The mandate cannot be completed from this record/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Continue" }).click();

        await page.getByRole("button", { name: "Ask the committee to align" }).click();
        await expect(
            page.getByText(/The committee can align on a bounded checklist/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Continue" }).click();

        await page.getByRole("button", { name: "Close meeting" }).click();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Continue" }).click();

        await expect(page).toHaveURL(/\/demo\/meetings$/);
        await page.getByTestId("archive-meeting").click();
        await expect(
            page.getByText(/Archived overlay recorded/)
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/remains ended/).first()).toBeVisible();
        await expect(
            page.getByText(/Unarchive and delete are unavailable in guided replay/)
        ).toBeVisible();
        await page.getByRole("button", { name: "Finish" }).click();
        await expect(page.getByText("Journey complete")).toBeVisible();

        await page.getByRole("button", { name: "Back" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+\?tab=closing$/);
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings$/);
        await expect(page.getByTestId("archive-meeting")).toBeEnabled();
        expect(liveMutations).toEqual([]);
    });

    test("keeps the guide keyboard-accessible and resets on a deep link", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/demo");

        await expect(page.getByText(/Step 1 of 8/)).toBeVisible();
        expect(
            await page.evaluate(() =>
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
            )
        ).toBe(true);

        const continueButton = page.getByRole("button", { name: "Continue" });
        await continueButton.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/demo\/new$/);
        await expect(page.locator('input[type="file"]')).toHaveCount(0);

        await page.getByRole("button", { name: "Back" }).click();
        await expect(page).toHaveURL(/\/demo$/);
        await expect(page.getByText(/Step 1 of 8/)).toBeVisible();

        await page.getByRole("button", { name: "Restart" }).click();
        await expect(page.getByText(/Step 1 of 8/)).toBeVisible();

        await page.goto("/demo/meetings/a0000000-0000-4000-8000-000000000001");
        await expect(page).toHaveURL(/\/demo$/);
        await expect(
            page.getByRole("heading", { name: /Prepared board/ })
        ).toBeVisible();
    });
});
