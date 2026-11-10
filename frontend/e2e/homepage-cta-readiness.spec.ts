import { expect, test } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

const IDEA =
    "One question. Different minds.";

test.describe("homepage demo departure readiness", () => {
    test("holds navigation until session and metadata are ready, then hands off", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        let sessionCalls = 0;
        await page.route("**/api/replay/session", async (route) => {
            sessionCalls += 1;
            await new Promise((resolve) => setTimeout(resolve, 180));
            await route.continue();
        });
        await page.route("**/api/replay/meetings/*/safe-config*", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 180));
            await route.continue();
        });

        await page.goto("/");
        await page.locator(".home-demo-cta").click();

        await expect(page).toHaveURL(/\/demo$/, { timeout: 15_000 });
        await expect(page.getByRole("heading", { name: IDEA })).toBeVisible();
        expect(sessionCalls).toBe(1);

        // The ready handoff is consumed by the demo entry; a refresh is a new
        // direct-entry acquisition and does not reuse browser persistence.
        await expectNoPublicPersistence(context, page);
        network.assertClean();
    });

    test("keeps a metadata failure on the homepage and retries only metadata", async ({
        page,
    }) => {
        let sessionCalls = 0;
        await page.route("**/api/replay/session", async (route) => {
            sessionCalls += 1;
            await route.continue();
        });
        await page.route("**/api/replay/meetings/*/safe-config*", (route) =>
            route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ detail: "metadata unavailable" }),
            })
        );

        await page.goto("/");
        await page.locator(".home-demo-cta").click();

        const status = page.locator(".home-demo-cta-status");
        await expect(status).toBeVisible({ timeout: 15_000 });
        await expect(status).toContainText("Try again");
        await expect(page).toHaveURL(/\/$/);
        expect(sessionCalls).toBe(1);

        await page.unroute("**/api/replay/meetings/*/safe-config*");
        await status.getByRole("button", { name: "Try again" }).click();

        await expect(page).toHaveURL(/\/demo$/, { timeout: 15_000 });
        await expect(page.getByRole("heading", { name: IDEA })).toBeVisible();
        expect(sessionCalls).toBe(1);
    });

    test("reduced motion still waits for readiness without the departure sweep", async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.route("**/api/replay/session", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 140));
            await route.continue();
        });

        await page.goto("/");
        await page.locator(".home-demo-cta").click();

        await expect(page).toHaveURL(/\/demo$/, { timeout: 15_000 });
        await expect(page.getByRole("heading", { name: IDEA })).toBeVisible();
    });

    test("repeated activation starts only one session read", async ({ page }) => {
        let sessionCalls = 0;
        await page.route("**/api/replay/session", async (route) => {
            sessionCalls += 1;
            await new Promise((resolve) => setTimeout(resolve, 300));
            await route.continue();
        });

        await page.goto("/");
        const cta = page.locator(".home-demo-cta");
        await cta.click();
        await cta.click({ force: true });

        await expect(page).toHaveURL(/\/demo$/, { timeout: 15_000 });
        expect(sessionCalls).toBe(1);
    });
});
