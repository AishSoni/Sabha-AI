import { test, expect, type Page } from "@playwright/test";

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
            await expectStep(pageA, 1);
            await pageA.getByRole("button", { name: "Restart" }).click();
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

            // Progress is not persisted in the browser or in a session cookie.
            for (const context of [contextA, contextB]) {
                const page = context === contextA ? pageA : pageB;
                const storageKeys = await page.evaluate(() =>
                    Object.keys(window.localStorage)
                );
                expect(
                    storageKeys.filter((key) => key !== "sabha:experience")
                ).toEqual([]);
                const cookies = await context.cookies(BASE);
                expect(cookies).toEqual([]);
            }
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });

    test("a restarted visitor gets a fresh run while the other keeps its own", async ({
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

            const restarted = pageA.waitForResponse(
                (candidate) =>
                    new URL(candidate.url()).pathname === "/api/replay/session" &&
                    candidate.status() === 200
            );
            await pageA.getByRole("button", { name: "Restart" }).click();
            const restartedSession = (await (await restarted).json()) as {
                run_id: string;
            };

            expect(restartedSession.run_id).not.toBe(sessionA.run_id);
            expect(restartedSession.run_id).not.toBe(sessionB.run_id);
            await expect(pageB).toHaveURL(/\/demo$/);
            await expectStep(pageB, 1);
            await expect(pageB.getByRole("heading", { name: /Prepared board/ })).toBeVisible();
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });
});
