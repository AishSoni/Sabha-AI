import { test, expect } from "@playwright/test";

test.describe("guided bond journey", () => {
    test("walks the prepared HDFC replay through archive", async ({ page }) => {
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

        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: /5 Sources/ }).first().click();
        await expect(
            page.getByText(/CRISIL Rating Rationale/i).first()
        ).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();

        await expect(
            page.getByText(/I disagree with treating AAA\/Stable as sufficient comfort/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Continue" }).click();

        await page.getByRole("button", { name: /Send prepared follow-up/ }).click();
        await expect(
            page.getByText(/The mandate cannot be completed from this record/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Continue" }).click();

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
        await page.getByRole("button", { name: "Finish" }).click();
        await expect(page.getByText("Journey complete")).toBeVisible();
    });
});
