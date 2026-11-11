import { test, expect, type Page } from "./support/demo-test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

/**
 * Main-journey shared documents (spec-43).
 *
 * Added samples are optional, browser-local, and owned by the prepared meeting.
 * The same document identity and readiness must appear in setup, the room Files
 * tab, and the shared knowledge stack, while the recorded meeting stays fixed.
 */
async function openSetup(page: Page) {
    const [response] = await Promise.all([
        page.waitForResponse(
            (candidate) =>
                new URL(candidate.url()).pathname === "/api/replay/session" &&
                candidate.status() === 200
        ),
        page.goto("/demo/new"),
    ]);
    const session = (await response.json()) as { package_version: string };
    expect(session.package_version).toBe("12");
    await expect(
        page.getByRole("heading", { name: "Create meeting" })
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "Added samples" })
    ).toBeVisible();
}

async function addSample(page: Page, fileName: RegExp) {
    await page.getByRole("button", { name: "Add approved sample" }).click();
    const picker = page.getByRole("dialog");
    await expect(picker).toBeVisible();
    await picker.getByRole("radio", { name: fileName }).check();
    await picker.getByRole("button", { name: "Add sample" }).click();
    await expect(picker).toBeHidden();
}

async function openRoomFiles(page: Page) {
    await page.getByRole("button", { name: "Create meeting" }).click();
    await expect(
        page.getByRole("heading", { name: "Meeting created" })
    ).toBeVisible();
    await page.getByRole("link", { name: "Open the meeting room" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+/);
    await page.getByRole("tab", { name: "Files" }).click();
}

test.describe("main-journey shared documents", () => {
    test("shows one ready sample in setup, the room, and the shared stack", async ({
        page,
        context,
    }) => {
        test.setTimeout(240_000);
        const network = guardNetwork(page);
        await serveRecordedAssets(page);

        await openSetup(page);
        await addSample(page, /hdfc-v007-shared-fact-sheet\.md/);
        await expect(page.getByText("Ready (4 chunks)")).toBeVisible({
            timeout: 30_000,
        });

        await openRoomFiles(page);
        await expect(
            page.getByRole("heading", { name: "Added to this demo" })
        ).toBeVisible();
        await expect(
            page.getByText("hdfc-v007-shared-fact-sheet.md").first()
        ).toBeVisible();
        await expect(page.getByText("Ready (4 chunks)")).toBeVisible();

        // SPA navigation keeps the browser-memory document alive.
        await page.getByRole("link", { name: "Knowledge" }).click();
        await page
            .locator('a[href="/demo/knowledge-stacks/shared-meeting-documents"]')
            .click();
        await expect(
            page.getByRole("heading", { name: "Meeting-wide documents" })
        ).toBeVisible();
        await expect(
            page.getByText("hdfc-v007-shared-fact-sheet.md").first()
        ).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("retries a failed sample once and carries the same ready document into the room", async ({
        page,
        context,
    }) => {
        test.setTimeout(240_000);
        const network = guardNetwork(page);
        await serveRecordedAssets(page);

        await openSetup(page);
        await addSample(page, /downside-worksheet\.md/);
        await expect(page.getByText("Failed", { exact: true })).toBeVisible({
            timeout: 30_000,
        });
        await page
            .getByRole("button", { name: "Retry downside-worksheet.md" })
            .click();
        await expect(page.getByText("Ready (3 chunks)")).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.getByText("Failed", { exact: true })).toHaveCount(0);

        await openRoomFiles(page);
        await expect(
            page.getByRole("heading", { name: "Added to this demo" })
        ).toBeVisible();
        await expect(page.getByText("downside-worksheet.md").first()).toBeVisible();
        await expect(page.getByText("Ready (3 chunks)")).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
