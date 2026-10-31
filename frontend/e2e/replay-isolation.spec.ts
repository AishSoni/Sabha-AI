import { test, expect, type Page } from "@playwright/test";
import { expectNoPublicPersistence } from "./support/guardrails";

/**
 * Two visitors, two browsers (spec-19).
 *
 * Replay progress is deliberately ephemeral: each browser context fetches its
 * own run id, keeps progress only in client memory, and must never observe or
 * overwrite another visitor's beat. The backend run-id isolation is covered by
 * the package-runtime integration tests; this is the browser-level proof.
 */
const BASE = "http://127.0.0.1:3100";

async function openBoard(page: Page) {
    const [response] = await Promise.all([
        page.waitForResponse(
            (candidate) =>
                new URL(candidate.url()).pathname === "/api/replay/session" &&
                candidate.status() === 200
        ),
        page.goto(`${BASE}/demo`),
    ]);
    await expect(page.getByRole("heading", { name: /Prepared board/ })).toBeVisible();
    await expect(page.getByText(/Step 1 of 8/)).toBeVisible();
    return (await response.json()) as { run_id: string; package_version: string };
}

async function expectStep(page: Page, step: number) {
    await expect(page.getByText(new RegExp(`Step ${step} of 8`))).toBeVisible();
}

test.describe("guided replay visitor isolation", () => {
    test("two contexts keep separate runs and do not move each other", async ({
        browser,
    }) => {
        const contextA = await browser.newContext();
        const contextB = await browser.newContext();
        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();

        try {
            const [sessionA, sessionB] = await Promise.all([
                openBoard(pageA),
                openBoard(pageB),
            ]);

            expect(sessionA.run_id).toBeTruthy();
            expect(sessionB.run_id).toBeTruthy();
            expect(sessionA.run_id).not.toBe(sessionB.run_id);
            expect(sessionA.package_version).toBe(sessionB.package_version);

            // B moves to the recorded creation beat and stays there.
            await pageB.getByRole("button", { name: "Continue" }).click();
            await expect(pageB).toHaveURL(/\/demo\/new$/);
            await expectStep(pageB, 2);

            // A moves the same distance, then exercises back, restart, and a
            // full refetch while B is parked on its beat.
            await pageA.getByRole("button", { name: "Continue" }).click();
            await expect(pageA).toHaveURL(/\/demo\/new$/);
            await expectStep(pageA, 2);

            await pageA.getByRole("button", { name: "Back" }).click();
            await expect(pageA).toHaveURL(/\/demo$/);
            // Back moves the inspection cursor; the acknowledged board step
            // remains complete, so the guide stays on step 2.
            await expectStep(pageA, 2);
            await pageA.getByRole("button", { name: "Restart recording" }).click();
            await expect(pageA).toHaveURL(/\/demo$/);
            await expectStep(pageA, 1);
            await pageA.reload();
            await expect(pageA.getByRole("heading", { name: /Prepared board/ })).toBeVisible();

            // None of that may move or overwrite B.
            await expect(pageB).toHaveURL(/\/demo\/new$/);
            await expectStep(pageB, 2);
            await expect(
                pageB.getByText(/Prepared preset — editing is disabled/)
            ).toBeVisible();
            await expect(
                pageB.getByRole("button", { name: "Create recorded meeting" })
            ).toBeVisible();

            // Progress is not persisted in any browser store or cookie.
            await expectNoPublicPersistence(contextA, pageA);
            await expectNoPublicPersistence(contextB, pageB);
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });

    test("restarting playback resets only the visitor's local state", async ({
        browser,
    }) => {
        const contextA = await browser.newContext();
        const contextB = await browser.newContext();
        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();

        try {
            const [sessionA, sessionB] = await Promise.all([
                openBoard(pageA),
                openBoard(pageB),
            ]);

            await pageA.getByRole("button", { name: "Restart recording" }).click();
            await expect(pageA).toHaveURL(/\/demo$/);
            await expectStep(pageA, 1);

            // The other visitor keeps its own run and its own guide position.
            expect(sessionA.run_id).not.toBe(sessionB.run_id);
            await expect(pageB).toHaveURL(/\/demo$/);
            await expectStep(pageB, 1);
            await expect(pageB.getByRole("heading", { name: /Prepared board/ })).toBeVisible();
            await expectNoPublicPersistence(contextA, pageA);
            await expectNoPublicPersistence(contextB, pageB);
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });
});
