import { test, expect, type Page } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

async function openRoom(page: Page) {
    await page.goto("/demo/meetings/a0000000-0000-4000-8000-000000000001");
    await expect(
        page.getByRole("heading", {
            name: /A HDFC Bond Review Demo/,
        })
    ).toBeVisible({ timeout: 30_000 });
}

test.describe("demo failure recovery", () => {
    test("a missing workspace seed fails closed but keeps the recording", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await page.route("**/api/replay/workspace-seed*", (route) =>
            route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ detail: "workspace seed unavailable" }),
            })
        );

        await page.goto("/demo/knowledge-stacks");
        await expect(
            page.getByRole("heading", { name: "Knowledge unavailable" })
        ).toBeVisible();
        await expect(page.getByText(/seed|workspace/i).first()).toBeVisible();

        await page.getByRole("link", { name: "Board", exact: true }).click();
        await expect(
            page.getByRole("heading", { name: /Demo board/ })
        ).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("an interrupted turn pauses honestly and resumes without a live fallback", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await openRoom(page);
        await page.route("**/api/replay/**/events*", (route) => route.abort());

        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(page.getByText(/Observation paused/).first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByRole("button", { name: "Resume", exact: true })
        ).toBeVisible();

        await page.unroute("**/api/replay/**/events*");
        const resume = page.getByRole("button", { name: "Resume", exact: true });
        await resume.focus();
        await page.keyboard.press("Enter");
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("a corrupt session read fails closed without inventing a meeting", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await page.route("**/api/replay/session", (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: "{not-json",
            })
        );

        await page.goto("/demo");
        await expect(
            page.getByRole("heading", { name: "Demo unavailable" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(page.getByTestId("tutorial-hud-compact")).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: /Credit Analyst opening facts/ })
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: /Archive meeting/ })
        ).toHaveCount(0);

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("a missing recorded tape pauses without composing a reply", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await openRoom(page);
        await page.route("**/api/replay/**/events*", (route) =>
            route.fulfill({
                status: 404,
                contentType: "application/json",
                body: JSON.stringify({ detail: "tape_missing" }),
            })
        );

        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(page.getByText(/Observation paused/).first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator(
                '[data-testid="message"][data-message-id="a0000000-0000-4000-8000-000000000402"]'
            )
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Show full response" })
        ).toBeVisible();
        await page.getByRole("button", { name: "Show full response" }).click();
        await expect(
            page.locator(
                '[data-testid="message"][data-message-id="a0000000-0000-4000-8000-000000000402"]'
            )
        ).toBeVisible({ timeout: 30_000 });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("a stream that ends without a terminal pauses instead of advancing", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await openRoom(page);
        await page.route("**/api/replay/**/events*", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: "",
            })
        );

        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(page.getByText(/Observation paused/).first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator(
                '[data-testid="message"][data-message-id="a0000000-0000-4000-8000-000000000402"]'
            )
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Show full response" })
        ).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("a replay backend outage fails closed without a live fallback", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await page.route("**/api/replay/session", (route) =>
            route.fulfill({
                status: 503,
                contentType: "application/json",
                body: JSON.stringify({ detail: "replay unavailable" }),
            })
        );

        await page.goto("/demo");
        await expect(
            page.getByRole("heading", { name: "Demo unavailable" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(page.getByTestId("tutorial-hud-compact")).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: /Credit Analyst opening facts/ })
        ).toHaveCount(0);

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
