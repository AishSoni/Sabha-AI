import { test, expect, type Page } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

/**
 * Original package compatibility (spec-27).
 *
 * The approved version-5 HDFC package predates chapters, transitions, and
 * exploration branches. The original eight-beat guide must still complete
 * against it without requiring any expanded affordance.
 */
async function openVersionFiveBoard(page: Page) {
    const [response] = await Promise.all([
        page.waitForResponse(
            (candidate) =>
                new URL(candidate.url()).pathname === "/api/replay/session" &&
                candidate.status() === 200
        ),
        page.goto("/demo"),
    ]);
    const session = (await response.json()) as { package_version: string };
    expect(session.package_version).toBe("5");
}

test.describe("version-5 package compatibility", () => {
    test.skip(
        process.env.E2E_LEGACY !== "1",
        "run through npm run test:e2e:legacy so the backend serves version 5"
    );

    test("walks the original eight-beat journey without expanded chapters", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await openVersionFiveBoard(page);

        await expect(
            page.getByRole("heading", { name: /Prepared board/ })
        ).toBeVisible();
        await expect(page.getByText(/Information as of 31 July 2020/).first()).toBeVisible();
        await expect(
            page.getByText("Chapters and inspection screens")
        ).toHaveCount(0);

        const knowledge = page
            .locator("summary")
            .filter({ hasText: "Knowledge assignments" });
        await expect(knowledge).toHaveCount(3);
        for (let index = 0; index < 3; index += 1) {
            await knowledge.nth(index).click();
        }
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page).toHaveURL(/\/demo\/new$/);
        await expect(page.getByText(/Step 2 of 8/)).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Try editing this setup" })
        ).toBeVisible();

        await page.getByRole("button", { name: "Create recorded meeting" }).click();
        await expect(page.getByText("Recorded intake ready")).toBeVisible();
        await expect(page.getByText(/Step 3 of 8/)).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+(?:\?.*)?$/);

        await page.getByRole("button", { name: "Ask the Credit Analyst" }).click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Step 4 of 8/)).toBeVisible({ timeout: 30_000 });

        await page.getByRole("button", { name: "Ask the Downside Reviewer" }).click();
        await expect(
            page.getByText(/I disagree with treating AAA\/Stable as sufficient comfort/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("tab", { name: /Disagreements 1/ }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.getByText(/Step 5 of 8/)).toBeVisible({ timeout: 30_000 });

        await page.getByRole("button", { name: "Send the supported follow-up" }).click();
        await expect(
            page.getByRole("button", { name: "Send the supported follow-up" })
        ).toHaveCount(0, { timeout: 30_000 });
        await page.getByRole("button", { name: "Ask the Portfolio Analyst" }).click();
        await page.getByRole("tab", { name: "Chat" }).click();
        await expect(
            page.getByText(/The mandate cannot be completed from this record/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Step 6 of 8/)).toBeVisible({ timeout: 30_000 });

        await page.getByRole("button", { name: "Ask the committee to align" }).click();
        await expect(
            page.getByText(/The committee can align on a bounded checklist/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("tab", { name: /Consensus 1/ }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.getByText(/Step 7 of 8/)).toBeVisible({ timeout: 30_000 });
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+\?tab=closing$/);

        await page.getByRole("button", { name: "Close meeting" }).click();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Step 8 of 8/)).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Continue" }).click();

        await expect(page).toHaveURL(/\/demo\/meetings$/);
        await page.getByTestId("archive-meeting").click();
        await expect(
            page.getByText(/Archived overlay recorded/)
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Journey complete")).toBeVisible({
            timeout: 30_000,
        });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
