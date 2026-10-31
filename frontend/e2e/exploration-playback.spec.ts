import { test, expect, type Page } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

const MEETING_ID = "a0000000-0000-4000-8000-000000000001";

async function openRoom(page: Page) {
    await page.goto("/demo");
    await expect(page.getByText(/Step 1 of 8/)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/demo\/new$/);
    await page.getByRole("button", { name: "Create recorded meeting" }).click();
    await expect(page.getByText("Recorded intake ready")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+$/);
}

async function openChapter(
    page: Page,
    chapter: string,
    tab: string,
    route = `/demo/meetings/${MEETING_ID}`
) {
    await page.goto(`${route}?chapter=${chapter}&tab=${tab}`);
}

test.describe("recorded exploration and playback", () => {
    test("opens completed chapters without walking preceding beats", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await serveRecordedAssets(page);

        await openChapter(page, "chapter-closing", "closing");
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Meeting ended")).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Final summary" })
        ).toBeVisible();

        await openChapter(page, "chapter-summary", "summary");
        await expect(
            page.getByRole("heading", { name: "Recorded summary" })
        ).toBeVisible();
        await expect(page.getByText("Recorded system summary")).toBeVisible();
        await expect(
            page.getByText(/Outcome: a research checklist, not a buy\/sell recommendation/)
        ).toBeVisible();
        await expect(page.getByText(/Inspection only/)).toBeVisible();

        await openChapter(page, "chapter-downside-first", "chat");
        await expect(
            page.getByText(/Testing the downside first is reasonable/)
        ).toBeVisible({ timeout: 30_000 });

        await openChapter(page, "chapter-red-team", "chat");
        await expect(
            page.getByText(/The checklist does not overstate the evidence/)
        ).toBeVisible({ timeout: 30_000 });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("changes speed, skips, replays, and restores the guide bookmark", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await serveRecordedAssets(page);
        await openRoom(page);

        const speed = page.getByRole("group", { name: "Recorded playback speed" });
        await expect(speed).toBeVisible();
        await speed.getByRole("button", { name: "2x" }).click();
        await expect(speed.getByRole("button", { name: "2x" })).toHaveAttribute(
            "aria-pressed",
            "true"
        );

        await page.getByRole("button", { name: "Ask the Credit Analyst" }).click();
        await expect(
            page.getByRole("button", { name: "Skip to prepared result" })
        ).toBeVisible();
        await page.getByRole("button", { name: "Skip to prepared result" }).click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Step 4 of 8/)).toBeVisible();

        await page.getByRole("button", { name: "Replay this prepared turn" }).click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });

        // Detour to a catalog screen, then resume the bookmarked guide step.
        await page
            .getByRole("link", { name: "Explore persona system-prompt history" })
            .click();
        await expect(page).toHaveURL(/\/demo\/roster\/persona-credit\/history$/);
        await page.getByRole("button", { name: "Resume guided journey" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+\?tab=chat/);
        await expect(page.getByText(/Step 4 of 8/)).toBeVisible();

        // Start the recorded close, skip its text, then replay the closing.
        await openChapter(page, "chapter-consensus", "consensus");
        await page.getByRole("button", { name: "Close meeting" }).click();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByRole("button", { name: "Skip to prepared result" })
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Skip to prepared result" }).click();
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Replay closing" }).click();
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("follows both opening alternatives to their recorded closings", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await serveRecordedAssets(page);
        await openRoom(page);

        await page.getByRole("button", { name: "Test the downside first" }).click();
        await expect(
            page.getByText(/Testing the downside first is reasonable/)
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Ask for the instrument record" }).click();
        await page.getByRole("button", { name: "Apply the mandate" }).click();
        await page.getByRole("tab", { name: "Chat" }).click();
        await expect(
            page.getByText(/The mandate still cannot be completed/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Close meeting" }).click();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByText(/The committee closed after the downside-first path/)
        ).toBeVisible({ timeout: 30_000 });

        await page.getByRole("button", { name: "Restart recording" }).click();
        await expect(page.getByText(/Step 1 of 8/)).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: "Create recorded meeting" }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+$/);

        await page.getByRole("button", { name: "Start from the mandate" }).click();
        await page.getByRole("tab", { name: "Chat" }).click();
        await expect(
            page.getByText(/Starting with the mandate exposes the gap immediately/)
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Close meeting" }).click();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByText(/The committee closed after starting from the mandate/)
        ).toBeVisible({ timeout: 30_000 });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
