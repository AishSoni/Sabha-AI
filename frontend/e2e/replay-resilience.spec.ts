import { test, expect, type Page } from "@playwright/test";

/**
 * Replay races and disconnects (spec-19).
 *
 * These are browser-level failure checks: rapid double actions must not skip
 * or duplicate a beat, refocus/polling must not advance the guide, an aborted
 * recorded stream must pause honestly and resume from the last event, and a
 * restart/refresh must discard stale client state without any live fallback.
 */
const BASE = "http://127.0.0.1:3100";

function trackLiveRequests(page: Page) {
    const liveRequests: string[] = [];
    page.on("request", (request) => {
        const url = request.url();
        if (url.includes("/api/meetings") && !url.includes("/api/replay")) {
            liveRequests.push(`${request.method()} ${url}`);
        }
    });
    return liveRequests;
}

async function enterRoom(page: Page) {
    await page.goto(`${BASE}/demo`);
    await expect(page.getByRole("heading", { name: /Prepared board/ })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/demo\/new$/);
    await page.getByRole("button", { name: "Create recorded meeting" }).click();
    await expect(page.getByText("Recorded intake ready")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+$/);
    await expect(page.getByText(/Step 3 of 8/)).toBeVisible();
}

test.describe("guided replay resilience", () => {
    test("rapid double actions advance exactly one recorded step", async ({ page }) => {
        const liveRequests = trackLiveRequests(page);
        await page.goto(`${BASE}/demo`);
        await expect(page.getByRole("heading", { name: /Prepared board/ })).toBeVisible();

        await page.getByRole("button", { name: "Continue" }).click({
            clickCount: 2,
            delay: 10,
        });
        await expect(page).toHaveURL(/\/demo\/new$/);
        await expect(page.getByText(/Step 2 of 8/)).toBeVisible();

        await page.getByRole("button", { name: "Create recorded meeting" }).click({
            clickCount: 2,
            delay: 10,
        });
        await expect(page.getByText("Recorded intake ready")).toBeVisible();
        await expect(page.getByText(/transition is already in progress/)).toHaveCount(0);

        await page.getByRole("button", { name: "Continue" }).click({
            clickCount: 2,
            delay: 10,
        });
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+$/);
        await expect(page.getByText(/Step 3 of 8/)).toBeVisible();

        expect(liveRequests).toEqual([]);
    });

    test("refocus and polling leave the guide waiting for the recorded action", async ({
        page,
    }) => {
        const liveRequests = trackLiveRequests(page);
        await enterRoom(page);

        const continueButton = page.getByRole("button", { name: "Continue" });
        await expect(continueButton).toBeDisabled();

        await page.bringToFront();
        await page.evaluate(() => {
            window.dispatchEvent(new Event("focus"));
            document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.waitForTimeout(1_000);

        await expect(page.getByText(/Step 3 of 8/)).toBeVisible();
        await expect(continueButton).toBeDisabled();
        await expect(page.getByText(/Thinking|Waiting in the meeting queue/)).toHaveCount(0);
        expect(liveRequests).toEqual([]);
    });

    test("an aborted recorded stream pauses honestly, resumes, and never goes live", async ({
        page,
    }) => {
        const liveRequests = trackLiveRequests(page);
        await enterRoom(page);

        let aborted = false;
        await page.route("**/api/replay/**/events*", async (route) => {
            if (!aborted) {
                aborted = true;
                await route.abort("failed");
                return;
            }
            await route.continue();
        });

        await page.getByRole("button", { name: "Ask the Credit Analyst" }).click();
        await expect(page.getByText(/Observation paused/)).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

        const resume = page.getByRole("button", { name: /^Resume$/ });
        await expect(resume).toBeVisible();
        await resume.click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        // Finishing the resumed turn advances the guide to the next beat on the
        // same screen, so Continue correctly waits for the next room action.
        await expect(page.getByText(/Step 4 of 8/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

        expect(liveRequests).toEqual([]);
    });

    test("restarting mid-stream and refreshing a room link discard stale state", async ({
        page,
    }) => {
        const liveRequests = trackLiveRequests(page);
        await enterRoom(page);

        const streamStarted = page.waitForRequest((request) =>
            request.url().includes("/api/replay/") && request.url().includes("/events")
        );
        await page.getByRole("button", { name: "Ask the Credit Analyst" }).click();
        await streamStarted;
        await page.getByRole("button", { name: "Restart" }).click();
        await expect(page).toHaveURL(/\/demo$/);
        await expect(page.getByText(/Step 1 of 8/)).toBeVisible();

        await page.waitForTimeout(2_000);
        await expect(page.getByText(/CRISIL's annexure row/)).toHaveCount(0);
        await expect(page.getByRole("heading", { name: /Prepared board/ })).toBeVisible();

        // Reach the room again, then refresh the deep link. A fresh provider
        // starts at the initial checkpoint and the room routes back to /demo.
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: "Create recorded meeting" }).click();
        await expect(page.getByText("Recorded intake ready")).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+$/);
        await page.reload();
        await expect(page).toHaveURL(/\/demo$/);
        await expect(page.getByText(/Step 1 of 8/)).toBeVisible();
        await expect(page.getByRole("heading", { name: /Prepared board/ })).toBeVisible();

        expect(liveRequests).toEqual([]);
    });
});
