import { test, expect, type Page } from "@playwright/test";
import { expectNoPublicPersistence, guardNetwork } from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

/**
 * Two visitors, two browsers (spec-19, retained for spec-30).
 *
 * Replay progress and the composed turn deck are deliberately ephemeral: each
 * browser context fetches its own run id, keeps progress only in client
 * memory, and must never observe or overwrite another visitor's state. The
 * backend run-id isolation is covered by the package-runtime integration
 * tests; this is the browser-level proof.
 */
const BASE = "http://127.0.0.1:3100";
const CREDIT_MESSAGE = "a0000000-0000-4000-8000-000000000402";
const DOWNSIDE_MESSAGE = "a0000000-0000-4000-8000-000000000403";
const PROMPT =
    "Define this persona's personality, expertise, and behavior...";

async function openBoard(page: Page) {
    const [response] = await Promise.all([
        page.waitForResponse(
            (candidate) =>
                new URL(candidate.url()).pathname === "/api/replay/session" &&
                candidate.status() === 200
        ),
        page.goto(`${BASE}/demo`),
    ]);
    const session = (await response.json()) as {
        run_id: string;
        package_version: string;
    };
    await expect(page.getByTestId("tutorial-hud")).toBeVisible();
    await expect(
        page.getByTestId("tutorial-hud").getByText("Start the meeting")
    ).toBeVisible();
    return session;
}

async function startRecording(page: Page) {
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

async function openExploreMenu(page: Page) {
    await page.locator('summary[aria-label="Explore demo"]:visible').click();
}

async function openPromptHistory(page: Page, name: string) {
    await page.getByRole("link", { name: "Personas" }).click();
    await page.getByRole("link", { name }).click();
    await page.getByRole("tab", { name: "System Prompt" }).click();
}

test.describe("recorded visitor isolation", () => {
    test("two contexts keep separate runs and do not move each other", async ({
        browser,
    }) => {
        const contextA = await browser.newContext();
        const contextB = await browser.newContext();
        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();
        const networkA = guardNetwork(pageA);
        const networkB = guardNetwork(pageB);

        try {
            const [sessionA, sessionB] = await Promise.all([
                openBoard(pageA),
                openBoard(pageB),
            ]);

            expect(sessionA.run_id).toBeTruthy();
            expect(sessionB.run_id).toBeTruthy();
            expect(sessionA.run_id).not.toBe(sessionB.run_id);
            expect(sessionA.package_version).toBe("10");
            expect(sessionB.package_version).toBe("10");

            // B moves to the recorded setup and stays there.
            await pageB.getByRole("link", { name: "Start meeting" }).click();
            await expect(pageB).toHaveURL(/\/demo\/new$/);
            await expect(
                pageB.getByTestId("tutorial-hud").getByText(
                    "Create meeting"
                )
            ).toBeVisible();

            // A moves the same distance, restarts the recording, and reloads.
            await pageA.getByRole("link", { name: "Start meeting" }).click();
            await expect(pageA).toHaveURL(/\/demo\/new$/);
            await openExploreMenu(pageA);
            await pageA
                .getByRole("button", { name: "Restart demo" })
                .click();
            await expect(pageA).toHaveURL(/\/demo$/);
            await expect(
                pageA.getByTestId("tutorial-hud").getByText("Start the meeting")
            ).toBeVisible();
            await pageA.reload();
            await expect(
                pageA.getByTestId("tutorial-hud").getByText("Start the meeting")
            ).toBeVisible();

            // None of that may move or overwrite B.
            await expect(pageB).toHaveURL(/\/demo\/new$/);
            await expect(
                pageB.getByTestId("tutorial-hud").getByText(
                    "Create meeting"
                )
            ).toBeVisible();
            await expect(
                pageB.getByRole("button", { name: "Create meeting" })
            ).toBeVisible();

            await expectNoPublicPersistence(contextA, pageA);
            await expectNoPublicPersistence(contextB, pageB);
            networkA.assertClean();
            networkB.assertClean();
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });

    test("hidden tips and chapter inspection stay local to one visitor", async ({
        browser,
    }) => {
        test.setTimeout(240_000);
        const contextA = await browser.newContext();
        const contextB = await browser.newContext();
        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();
        const networkA = guardNetwork(pageA);
        const networkB = guardNetwork(pageB);

        try {
            await serveRecordedAssets(pageA);
            await Promise.all([openBoard(pageA), openBoard(pageB)]);
            await Promise.all([startRecording(pageA), startRecording(pageB)]);

            await pageA
                .getByRole("button", { name: "Credit Analyst opening facts" })
                .click();
            await expect(message(pageA, CREDIT_MESSAGE)).toBeVisible({
                timeout: 30_000,
            });
            await pageB
                .getByRole("button", { name: "Downside challenge" })
                .click();
            await expect(message(pageB, DOWNSIDE_MESSAGE)).toBeVisible({
                timeout: 30_000,
            });

            // A hides the card, changes route, and inspects a chapter while hidden.
            await openExploreMenu(pageA);
            await pageA
                .getByRole("button", { name: "Hide", exact: true })
                .click();
            await expect(pageA.getByTestId("tutorial-hud")).toHaveCount(0);
            await expect(
                pageA.getByTestId("tutorial-hud-compact")
            ).toBeVisible();
            await openExploreMenu(pageA);
            await pageA
                .getByRole("link", { name: "Downside-first branch" })
                .click();
            await expect(
                pageA.getByText(/Testing the downside first is reasonable/)
            ).toBeVisible({ timeout: 30_000 });
            await expect(pageA.getByTestId("tutorial-hud")).toHaveCount(0);
            await expect(
                pageA.getByTestId("tutorial-hud-compact")
            ).toBeVisible();

            // Resuming keeps the hidden state until the visitor shows tips.
            await openExploreMenu(pageA);
            await pageA
                .getByRole("button", { name: "Resume current meeting" })
                .click();
            await expect(pageA).toHaveURL(/\/demo\/meetings\/[^/]+\?tab=chat/);
            await expect(pageA.getByTestId("tutorial-hud")).toHaveCount(0);
            await pageA.getByRole("button", { name: "Show tips" }).click();
            await expect(
                pageA.getByTestId("tutorial-announcement")
            ).toContainText("1 of 4 replies");
            await expect(message(pageA, CREDIT_MESSAGE)).toBeVisible();
            await expect(message(pageA, DOWNSIDE_MESSAGE)).toHaveCount(0);

            // B is untouched by A's chapter detour and hidden state.
            await expect(pageB).toHaveURL(/\/demo\/meetings\/[^/]+/);
            await expect(
                pageB.getByTestId("tutorial-announcement")
            ).toContainText("1 of 4 replies");
            await expect(message(pageB, DOWNSIDE_MESSAGE)).toBeVisible();

            await expectNoPublicPersistence(contextA, pageA);
            await expectNoPublicPersistence(contextB, pageB);
            networkA.assertClean();
            networkB.assertClean();
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });

    test("recording restart clears only the owning visitor's turn deck", async ({
        browser,
    }) => {
        test.setTimeout(240_000);
        const contextA = await browser.newContext();
        const contextB = await browser.newContext();
        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();
        const networkA = guardNetwork(pageA);
        const networkB = guardNetwork(pageB);

        try {
            await Promise.all([openBoard(pageA), openBoard(pageB)]);
            await Promise.all([startRecording(pageA), startRecording(pageB)]);

            await pageA
                .getByRole("button", { name: "Credit Analyst opening facts" })
                .click();
            await expect(message(pageA, CREDIT_MESSAGE)).toBeVisible({
                timeout: 30_000,
            });
            await pageB
                .getByRole("button", { name: "Downside challenge" })
                .click();
            await expect(message(pageB, DOWNSIDE_MESSAGE)).toBeVisible({
                timeout: 30_000,
            });

            await openExploreMenu(pageA);
            await pageA
                .getByRole("button", { name: "Restart demo" })
                .click();
            await expect(pageA).toHaveURL(/\/demo$/);
            await expect(
                pageA.getByTestId("tutorial-hud").getByText("Start the meeting")
            ).toBeVisible();
            await pageA.reload();
            await expect(
                pageA.getByTestId("tutorial-hud").getByText("Start the meeting")
            ).toBeVisible();

            // A new deck starts empty; the old reply cannot leak into it.
            await startRecording(pageA);
            await expect(
                pageA.getByTestId("tutorial-announcement")
            ).toContainText("0 of 4 replies");
            await expect(message(pageA, CREDIT_MESSAGE)).toHaveCount(0);

            // B keeps its run, its reply, and its own progress.
            await expect(pageB).toHaveURL(/\/demo\/meetings\/[^/]+/);
            await expect(
                pageB.getByTestId("tutorial-announcement")
            ).toContainText("1 of 4 replies");
            await expect(message(pageB, DOWNSIDE_MESSAGE)).toBeVisible();
            await expect(message(pageB, CREDIT_MESSAGE)).toHaveCount(0);

            await expectNoPublicPersistence(contextA, pageA);
            await expectNoPublicPersistence(contextB, pageB);
            networkA.assertClean();
            networkB.assertClean();
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });

    test("practice edits stay isolated and survive only a recording restart", async ({
        browser,
    }) => {
        test.setTimeout(240_000);
        const contextA = await browser.newContext();
        const contextB = await browser.newContext();
        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();
        const networkA = guardNetwork(pageA);
        const networkB = guardNetwork(pageB);

        try {
            await serveRecordedAssets(pageA);
            await Promise.all([openBoard(pageA), openBoard(pageB)]);

            await openPromptHistory(pageA, "Mira");
            await pageA.getByPlaceholder(PROMPT).fill("Visitor A practice marker.");
            await pageA
                .getByRole("button", { name: "Save as New Version" })
                .click();
            await expect(
                pageA.getByText(/Saved version 4 and made it active\./)
            ).toBeVisible();

            await openPromptHistory(pageB, "Arjun");
            await pageB.getByPlaceholder(PROMPT).fill("Visitor B practice marker.");
            await pageB
                .getByRole("button", { name: "Save as New Version" })
                .click();
            await expect(
                pageB.getByText(/Saved version 3 and made it active\./)
            ).toBeVisible();

            // A starts a practice setup with queued work, then resets.
            await pageA.getByRole("link", { name: "New meeting" }).click();
            await pageA
                .getByRole("button", { name: "Try editing this setup" })
                .click();
            await expect(
                pageA.getByRole("heading", { name: "Practice setup" })
            ).toBeVisible();
            await pageA
                .getByRole("button", { name: "Add approved sample" })
                .click();
            const picker = pageA.getByRole("dialog");
            await picker
                .getByRole("radio", { name: /downside-worksheet\.md/ })
                .check();
            await picker.getByRole("button", { name: "Add sample" }).click();
            await pageA
                .getByRole("button", { name: "Create practice setup" })
                .click();
            await expect(pageA).toHaveURL(/\/demo\/meetings\/local-/);
            await expect(pageA.getByText("Captured participants")).toBeVisible();
            await expect(
                pageA.getByText(/Queued|Indexing|Failed|Ready/)
            ).toBeVisible({ timeout: 10_000 });
            await expect(
                pageA.getByRole("link", { name: "Open practice setup" })
            ).toHaveCount(0);

            await pageA.getByRole("button", { name: "Reset demo" }).click();
            await pageA
                .getByRole("button", { name: "Reset and discard changes" })
                .click();
            await expect(
                pageA.getByText("This practice setup is not available")
            ).toBeVisible();

            // B is untouched by A's reset.
            await expect(pageB.getByPlaceholder(PROMPT)).toHaveValue(
                "Visitor B practice marker."
            );

            // A's reset removed its own prompt edit.
            await openPromptHistory(pageA, "Mira");
            await expect(pageA.getByPlaceholder(PROMPT)).not.toHaveValue(
                "Visitor A practice marker."
            );

            // A new edit survives a recording-only restart.
            await pageA
                .getByPlaceholder(PROMPT)
                .fill("Visitor A restart marker.");
            await pageA
                .getByRole("button", { name: "Save as New Version" })
                .click();
            await expect(
                pageA.getByText(/Saved version 4 and made it active\./)
            ).toBeVisible();
            await openExploreMenu(pageA);
            await pageA
                .getByRole("button", { name: "Restart demo" })
                .click();
            await expect(pageA).toHaveURL(/\/demo$/);
            await openPromptHistory(pageA, "Mira");
            await expect(pageA.getByPlaceholder(PROMPT)).toHaveValue(
                "Visitor A restart marker."
            );

            // A full reset removes the remaining practice edit.
            await pageA.getByRole("button", { name: "Reset demo" }).click();
            await pageA
                .getByRole("button", { name: "Reset and discard changes" })
                .click();
            await openPromptHistory(pageA, "Mira");
            await expect(pageA.getByPlaceholder(PROMPT)).not.toHaveValue(
                "Visitor A restart marker."
            );

            await expectNoPublicPersistence(contextA, pageA);
            await expectNoPublicPersistence(contextB, pageB);
            networkA.assertClean();
            networkB.assertClean();
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });
});
