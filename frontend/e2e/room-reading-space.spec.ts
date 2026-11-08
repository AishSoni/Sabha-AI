import { test, expect, type Page } from "@playwright/test";

/**
 * Addendum A.3: the discussion owns its reading space.
 *
 * It measures the conversation work area (below the room header) against the
 * scrollable discussion viewport at the two desktop baselines.
 */
async function enterRecordedRoom(page: Page) {
    await page.goto("/demo");
    await page.getByRole("link", { name: "Start meeting" }).click();
    await page.getByRole("button", { name: "Create meeting" }).click();
    await page.getByRole("link", { name: "Open the meeting room" }).click();
    await expect(page.getByTestId("room-work-area")).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.getByTestId("room-discussion")).toBeVisible();
}

async function measureRoom(page: Page) {
    const workArea = page.getByTestId("room-work-area");
    const discussion = page
        .getByTestId("room-discussion")
        .locator('[data-slot="scroll-area-viewport"]');

    const workBox = await workArea.boundingBox();
    const discussionBox = await discussion.boundingBox();
    expect(workBox).not.toBeNull();
    expect(discussionBox).not.toBeNull();

    const ratio = discussionBox!.height / workBox!.height;
    const outerScroll = await page.evaluate(
        () =>
            document.documentElement.scrollHeight >
            window.innerHeight + 1
    );

    return {
        workHeight: workBox!.height,
        discussionHeight: discussionBox!.height,
        ratio,
        outerScroll,
    };
}

test("keeps at least two-thirds of the room work area for discussion", async ({
    page,
}) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterRecordedRoom(page);

    const desktop = await measureRoom(page);
    expect(desktop.outerScroll).toBe(false);
    expect(desktop.ratio).toBeGreaterThanOrEqual(2 / 3);

    await page.setViewportSize({ width: 1920, height: 917 });
    const wide = await measureRoom(page);
    expect(wide.outerScroll).toBe(false);
    expect(wide.ratio).toBeGreaterThanOrEqual(2 / 3);
});

test("keeps the room operable without page-level horizontal overflow", async ({
    page,
}) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1024, height: 768 });
    await enterRecordedRoom(page);

    for (const viewport of [
        { width: 320, height: 844 },
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1024, height: 768 },
    ]) {
        await page.setViewportSize(viewport);
        await expect(page.getByTestId("room-discussion")).toBeVisible();
        await expect(
            page.getByRole("group", { name: "Meeting controls" })
        ).toBeVisible();

        const pageOverflow = await page.evaluate(
            () =>
                document.documentElement.scrollWidth >
                document.documentElement.clientWidth + 1
        );
        expect(pageOverflow).toBe(false);
    }
});
