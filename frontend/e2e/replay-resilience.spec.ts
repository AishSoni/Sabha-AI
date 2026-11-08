import { test, expect, type Page } from "@playwright/test";
import { guardNetwork } from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

/**
 * Replay races and disconnects (spec-19, retained for spec-30).
 *
 * These are browser-level failure checks: rapid double dispatch must settle one
 * turn, an aborted recorded stream must pause honestly and resume from the last
 * event, and a reset mid-stream must discard stale work without any live
 * fallback. Recorded recovery never offers a queue Cancel button.
 */
const BASE = "http://127.0.0.1:3100";
const CREDIT_MESSAGE = "a0000000-0000-4000-8000-000000000402";

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

async function startRecording(page: Page) {
    await page.goto(`${BASE}/demo`);
    await page.getByRole("link", { name: "Start meeting" }).click();
    await expect(page).toHaveURL(/\/demo\/new$/);
    await page.getByRole("button", { name: "Create meeting" }).click();
    await expect(page.getByText("Meeting created")).toBeVisible();
    await page.getByRole("link", { name: "Open the meeting room" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+\?tab=chat$/);
    await expect(
        page.getByTestId("tutorial-hud").getByText("Choose who speaks next")
    ).toBeVisible();
}

function message(page: Page, id: string) {
    return page.locator(`[data-testid="message"][data-message-id="${id}"]`);
}

test.describe("recorded replay resilience", () => {
    test("rapid double actions settle exactly one prepared turn", async ({
        page,
    }) => {
        test.setTimeout(240_000);
        const network = guardNetwork(page);
        const liveRequests = trackLiveRequests(page);
        await startRecording(page);

        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click({ clickCount: 2, delay: 10 });
        const showFull = page.getByRole("button", {
            name: "Show full response",
        });
        const credit = message(page, CREDIT_MESSAGE);
        // A rapid second click can land on the reveal control once the first
        // click readies the turn. Either outcome is valid as long as the
        // transcript still settles exactly one prepared reply.
        await expect(showFull.or(credit)).toBeVisible({ timeout: 30_000 });
        if (await showFull.isVisible()) {
            await showFull.click();
        }
        await expect(
            page.getByRole("button", { name: "Cancel", exact: true })
        ).toHaveCount(0);

        await expect(credit).toBeVisible({
            timeout: 30_000,
        });
        await expect(message(page, CREDIT_MESSAGE)).toHaveCount(1);
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("1 of 4 replies");
        await expect(
            page.getByText(/transition is already in progress|not available/)
        ).toHaveCount(0);

        expect(liveRequests).toEqual([]);
        network.assertClean();
    });

    test("an aborted recorded stream pauses honestly, resumes, and never goes live", async ({
        page,
    }) => {
        test.setTimeout(240_000);
        const network = guardNetwork(page);
        const liveRequests = trackLiveRequests(page);
        await startRecording(page);

        let aborted = false;
        await page.route("**/api/replay/**/events*", async (route) => {
            if (!aborted) {
                aborted = true;
                await route.abort("failed");
                return;
            }
            await route.continue();
        });

        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(page.getByText(/Observation paused/)).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(page.getByTestId("tutorial-hud-compact")).toHaveCount(0);

        const resume = page.getByRole("button", { name: /^Resume$/ });
        await expect(resume).toBeVisible();
        await resume.focus();
        await page.keyboard.press("Enter");
        await expect(message(page, CREDIT_MESSAGE)).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("1 of 4 replies", { timeout: 30_000 });
        await expect(
            page.getByRole("button", { name: "Cancel", exact: true })
        ).toHaveCount(0);

        expect(liveRequests).toEqual([]);
        network.assertClean();
    });

    test("resetting mid-stream discards pending work and recovers safely", async ({
        page,
    }) => {
        test.setTimeout(240_000);
        const network = guardNetwork(page);
        const liveRequests = trackLiveRequests(page);
        await startRecording(page);

        const streamStarted = page.waitForRequest(
            (request) =>
                request.url().includes("/api/replay/") &&
                request.url().includes("/events")
        );
        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await streamStarted;
        await page.getByRole("button", { name: "Reset demo" }).click();

        await page.waitForTimeout(2_000);
        await expect(message(page, CREDIT_MESSAGE)).toHaveCount(0);
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("0 of 4 replies");
        await expect(
            page.getByText(/Observation paused|Something went wrong/)
        ).toHaveCount(0);

        // A refresh discards the remaining ephemeral deck without a live turn.
        await page.reload();
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("0 of 4 replies");
        await expect(message(page, CREDIT_MESSAGE)).toHaveCount(0);

        expect(liveRequests).toEqual([]);
        network.assertClean();
    });

    test("double adding a prepared sample creates one local document", async ({
        page,
    }) => {
        const network = guardNetwork(page);
        await serveRecordedAssets(page);
        await page.goto("/demo/knowledge-stacks/credit-private");
        await expect(
            page.getByRole("heading", {
                name: "Credit evidence (private to The Credit Analyst)",
            })
        ).toBeVisible();

        page.on("dialog", (dialog) => void dialog.accept());
        await page
            .getByRole("button", { name: "Delete credit-evidence.md" })
            .click();
        await expect(page.getByText("credit-evidence.md")).toHaveCount(0);

        await page.getByRole("button", { name: "Add sample" }).click();
        const picker = page.getByRole("dialog");
        await picker
            .getByRole("radio", { name: /credit-evidence\.md/ })
            .check();
        await picker.getByRole("button", { name: "Add sample" }).click({
            clickCount: 2,
            delay: 10,
        });

        await expect(page.getByText("Ready (2 chunks)")).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByRole("button", { name: "Delete credit-evidence.md" })
        ).toHaveCount(1);
        await expect(page.getByText(/already added in this destination/)).toHaveCount(0);
        network.assertClean();
    });
});
