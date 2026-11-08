import { test, expect, type Page } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

const MEETING_ID = "a0000000-0000-4000-8000-000000000001";
const CREDIT_MESSAGE = "a0000000-0000-4000-8000-000000000402";
const DOWNSIDE_MESSAGE = "a0000000-0000-4000-8000-000000000403";

async function startRecording(page: Page) {
    await page.goto("/demo");
    await page.getByRole("link", { name: "Start meeting" }).click();
    await expect(page).toHaveURL(/\/demo\/new$/);
    await page.getByRole("button", { name: "Create meeting" }).click();
    await expect(page.getByRole("heading", { name: "Meeting created" })).toBeVisible();
    await page.getByRole("link", { name: "Open the meeting room" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+/);
    await expect(
        page.getByTestId("tutorial-hud").getByText("Choose who speaks next")
    ).toBeVisible();
}

function message(page: Page, id: string) {
    return page.locator(`[data-testid="message"][data-message-id="${id}"]`);
}

async function openChapter(
    page: Page,
    chapter: string,
    tab: string,
    route = `/demo/meetings/${MEETING_ID}`
) {
    await page.goto(`${route}?chapter=${chapter}&tab=${tab}`);
}

async function openExploreMenu(page: Page) {
    await page.getByLabel("Explore demo").click();
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
            page.getByRole("heading", { name: "Summary" })
        ).toBeVisible();
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("0 of 4 replies");

        await openChapter(page, "chapter-summary", "summary");
        await expect(
            page.getByRole("heading", { name: "Summary" })
        ).toBeVisible();
        await expect(page.getByText("System summary")).toBeVisible();
        await expect(
            page.getByText(/Outcome: a research checklist, not a buy\/sell recommendation/)
        ).toBeVisible();
        await expect(page.getByText(/Inspection only/)).toBeVisible();
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("0 of 4 replies");

        await openChapter(page, "chapter-downside-first", "chat");
        await expect(
            page.getByText(/Testing the downside first is reasonable/)
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("0 of 4 replies");

        await openChapter(page, "chapter-red-team", "chat");
        await expect(
            page.getByText(/The checklist does not overstate the evidence/)
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("0 of 4 replies");

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("expands a reply and resumes the composed meeting", async ({
        page,
        context,
    }) => {
        test.setTimeout(240_000);
        const network = guardNetwork(page);
        await serveRecordedAssets(page);
        await startRecording(page);

        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(
            page.getByRole("button", { name: "Show full response" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByRole("button", { name: "Cancel", exact: true })
        ).toHaveCount(0);
        await page.getByRole("button", { name: "Show full response" }).click();
        await expect(message(page, CREDIT_MESSAGE)).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("1 of 4 replies");

        await page.getByRole("button", { name: "Repeat last turn" }).click();
        await expect(message(page, CREDIT_MESSAGE)).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("1 of 4 replies");

        // Inspect a recorded branch without adding it to the composed deck.
        await openExploreMenu(page);
        await page.getByRole("link", { name: "Downside-first branch" }).click();
        await expect(
            page.getByText(/Testing the downside first is reasonable/)
        ).toBeVisible({ timeout: 30_000 });
        await expect(message(page, DOWNSIDE_MESSAGE)).toHaveCount(0);

        await openExploreMenu(page);
        await page
            .getByRole("button", { name: "Resume current meeting" })
            .click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+\?tab=chat/);
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("1 of 4 replies");
        await expect(message(page, CREDIT_MESSAGE)).toBeVisible();
        await expect(message(page, DOWNSIDE_MESSAGE)).toHaveCount(0);

        // The resumed deck still accepts the next prepared reply.
        await page.getByRole("button", { name: "Downside challenge" }).click();
        await expect(message(page, DOWNSIDE_MESSAGE)).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("2 of 4 replies");

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
