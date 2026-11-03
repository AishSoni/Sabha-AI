import { test, expect, type Page } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

/**
 * Spec-29: one contextual tip, anchored to the real control.
 *
 * These checks never press a generic Continue/Next button: progress comes from
 * the recorded outcomes the room accepts.
 */
async function startRecording(page: Page) {
    const network = guardNetwork(page);
    await page.goto("/demo");
    const hud = page.getByTestId("tutorial-hud");
    await expect(hud).toBeVisible();
    await expect(hud.getByText("Start the meeting")).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Start the meeting" }).click();
    await expect(page).toHaveURL(/\/demo\/new$/);
    await expect(hud.getByText("Create the recorded meeting")).toBeVisible();

    await page.getByRole("button", { name: "Create recorded meeting" }).click();
    await expect(page.getByText("Recorded intake ready")).toBeVisible();
    await expect(hud.getByText("Open the meeting room")).toBeVisible();

    await page.getByRole("link", { name: "Open the meeting room" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+/);
    return { hud, network };
}

async function archiveRecording(page: Page) {
    await page
        .getByRole("button", { name: "Credit Analyst opening facts" })
        .click();
    await page.getByRole("button", { name: "Downside challenge" }).click();
    await page.getByRole("button", { name: "Mandate review" }).click();
    await page.getByRole("button", { name: "Committee alignment" }).click();
    await page.getByRole("button", { name: "Send question" }).click();
    await page.getByRole("button", { name: "Close meeting" }).click();
    await page.getByRole("button", { name: "Vote to End" }).click();
    await page.getByRole("button", { name: "Start Vote" }).click();
    await expect(
        page.getByText(/The committee voted to conclude/).first()
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Go to meetings" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings$/);
    await page.getByTestId("archive-meeting").click();
    await expect(page.getByTestId("tutorial-hud").getByText("Demo complete")).toBeVisible({
        timeout: 30_000,
    });
    await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe("contextual demo tutorial", () => {
    test("anchors one tip at a time and completes the recording", async ({
        page,
        context,
    }) => {
        test.setTimeout(180_000);
        const { hud, network } = await startRecording(page);

        await expect(hud.getByText("Choose who speaks next")).toBeVisible();
        await expect(hud.getByText("0 of 4 replies")).toBeVisible();
        const ring = page.getByTestId("tutorial-ring");
        await expect(ring).toBeVisible();
        await expect(ring).toHaveCSS("pointer-events", "none");

        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(hud.getByText("1 of 4 replies")).toBeVisible({
            timeout: 30_000,
        });
        await expect(hud.getByText("Choose who speaks next")).toBeVisible();

        await hud.getByRole("button", { name: "Hide" }).click();
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await page.getByRole("button", { name: "Show tips" }).click();
        await expect(hud.getByText("Choose who speaks next")).toBeVisible();
        await expect(hud.getByText("1 of 4 replies")).toBeVisible();

        await page.getByRole("button", { name: "Downside challenge" }).click();
        await page.getByRole("button", { name: "Mandate review" }).click();
        await page.getByRole("button", { name: "Committee alignment" }).click();
        await expect(hud.getByText("Send your follow-up")).toBeVisible({
            timeout: 30_000,
        });

        await page.getByRole("button", { name: "Send question" }).click();
        await expect(hud.getByText("Close the meeting")).toBeVisible({
            timeout: 30_000,
        });

        await page.getByRole("button", { name: "Close meeting" }).click();
        await expect(hud.getByText("Vote to end the meeting")).toBeVisible({
            timeout: 30_000,
        });
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("link", { name: "Go to meetings" }).scrollIntoViewIfNeeded();
        await expect(
            hud.getByText("Return to the meetings list")
        ).toBeVisible({ timeout: 30_000 });

        await page.getByRole("link", { name: "Go to meetings" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings$/);
        await page.getByTestId("archive-meeting").scrollIntoViewIfNeeded();
        await expect(hud.getByText("Archive the meeting")).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Explore prompt versions" })
        ).toHaveCount(0);

        await page.getByTestId("archive-meeting").click();
        await expect(hud.getByText("Demo complete")).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByRole("button", { name: "Explore prompt versions" })
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Explore knowledge stacks" })
        ).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("keeps the card inside a 390x844 viewport without covering the control", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/demo");

        const hud = page.getByTestId("tutorial-hud");
        await expect(hud).toBeVisible();
        await expect(
            hud.getByLabel("Explore recording")
        ).toBeVisible();
        await expect(page.getByTestId("tutorial-hud-compact")).toHaveCount(0);

        const card = await hud.boundingBox();
        expect(card).not.toBeNull();
        expect(card!.x).toBeGreaterThanOrEqual(0);
        expect(card!.x + card!.width).toBeLessThanOrEqual(390);

        const target = await page
            .getByRole("link", { name: "Start the meeting" })
            .boundingBox();
        expect(target).not.toBeNull();
        const overlaps =
            card!.x < target!.x + target!.width &&
            card!.x + card!.width > target!.x &&
            card!.y < target!.y + target!.height &&
            card!.y + card!.height > target!.y;
        expect(overlaps).toBe(false);

        await expect(hud).toHaveCSS("animation-name", "none");
        await expect(hud).toHaveCSS("transition-duration", "0s");

        await hud.getByRole("button", { name: "Hide" }).focus();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await page.getByRole("button", { name: "Show tips" }).press("Enter");
        await expect(page.getByTestId("tutorial-hud")).toBeVisible();
    });

    test("runs either optional tour without touching the archived recording", async ({
        page,
    }) => {
        test.setTimeout(180_000);
        await startRecording(page);
        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await page.getByRole("button", { name: "Downside challenge" }).click();
        await page.getByRole("button", { name: "Mandate review" }).click();
        await page.getByRole("button", { name: "Committee alignment" }).click();
        await page.getByRole("button", { name: "Send question" }).click();
        await page.getByRole("button", { name: "Close meeting" }).click();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("link", { name: "Go to meetings" }).click();
        await page.getByTestId("archive-meeting").click();
        const hud = page.getByTestId("tutorial-hud");
        await expect(hud.getByText("Demo complete")).toBeVisible({
            timeout: 30_000,
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        await hud.getByRole("button", { name: "Explore prompt versions" }).click();
        await expect(hud.getByText("Open a persona")).toBeVisible();

        await page.getByRole("link", { name: "Personas" }).click();
        await expect(hud.getByText("Open a persona")).toBeVisible();
        await page.getByRole("link", { name: /The Credit Analyst/ }).click();
        await expect(hud.getByText("Open its prompt versions")).toBeVisible();
        await page.getByRole("tab", { name: /System Prompt/ }).click();
        await expect(hud.getByText("View an earlier version")).toBeVisible();
        await page.getByRole("button", { name: /View version/ }).first().click();
        await expect(hud.getByText("Prompt tour complete")).toBeVisible();
        await expect(
            hud.getByRole("button", { name: "Back to demo" })
        ).toBeVisible();
        await hud.getByRole("button", { name: "Finish tour" }).click();
        await expect(hud.getByText("Demo complete")).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));

        await hud.getByRole("button", { name: "Explore knowledge stacks" }).click();
        await expect(hud.getByText("Open knowledge stacks")).toBeVisible();
        await page.getByRole("link", { name: "Knowledge" }).click();
        await expect(hud.getByText("Open a stack")).toBeVisible();
        await page.getByRole("link", { name: /^Open/ }).first().click();
        await expect(hud.getByText("Inspect a document")).toBeVisible();
        await page
            .getByRole("button", { name: /^Preview evidence:/ })
            .first()
            .click();
        const preview = page.getByRole("dialog");
        await expect(preview).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(preview).toBeHidden();
        await expect(hud.getByText("Knowledge tour complete")).toBeVisible();
        await hud.getByRole("button", { name: "Finish tour" }).click();
        await expect(hud.getByText("Demo complete")).toBeVisible();
    });

    test("stays hidden through a turn and a route change, then resumes the same objective", async ({
        page,
        context,
    }) => {
        const { hud, network } = await startRecording(page);
        const compact = page.getByTestId("tutorial-hud-compact");

        await hud.getByRole("button", { name: "Hide" }).click();
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(compact).toBeVisible();

        // The visitor can still act while hidden; the card must not pop back
        // when the reply settles.
        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(compact).toBeVisible();

        await page.getByRole("link", { name: "Personas" }).click();
        await expect(page).toHaveURL(/\/demo\/roster/);
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(compact).toBeVisible();

        await page.goBack();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+/);
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);

        await page.getByRole("button", { name: "Show tips" }).click();
        await expect(hud.getByText("Choose who speaks next")).toBeVisible();
        await expect(hud.getByText("1 of 4 replies")).toBeVisible();

        await page.getByRole("button", { name: "Downside challenge" }).click();
        await expect(hud.getByText("2 of 4 replies")).toBeVisible({
            timeout: 30_000,
        });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("suspends while an evidence dialog is open and restores the same tip", async ({
        page,
        context,
    }) => {
        await serveRecordedAssets(page);
        const { hud, network } = await startRecording(page);

        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(hud.getByText("1 of 4 replies")).toBeVisible({
            timeout: 30_000,
        });

        await page.getByRole("button", { name: /5 Sources/ }).first().click();
        await expect(
            page.getByText(/CRISIL Rating Rationale/i).first()
        ).toBeVisible();
        await page
            .getByRole("button", { name: /^Preview evidence:/ })
            .first()
            .click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        // While the dialog owns the screen the tutorial leaves no floating
        // card or compact bar, and focus stays inside the modal.
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(page.getByTestId("tutorial-hud-compact")).toHaveCount(0);
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        document.activeElement?.closest('[role="dialog"]') !==
                        null
                )
            )
            .toBe(true);

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(hud.getByText("Choose who speaks next")).toBeVisible();
        await expect(hud.getByText("1 of 4 replies")).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("ends either optional tour early without restarting the meeting", async ({
        page,
        context,
    }) => {
        test.setTimeout(180_000);
        const { hud, network } = await startRecording(page);
        await archiveRecording(page);

        await hud
            .getByRole("button", { name: "Explore prompt versions" })
            .click();
        await expect(hud.getByText("Open a persona")).toBeVisible();
        await hud.getByRole("button", { name: "End tour" }).click();
        await expect(hud.getByText("Demo complete")).toBeVisible();

        await hud
            .getByRole("button", { name: "Explore knowledge stacks" })
            .click();
        await expect(hud.getByText("Open knowledge stacks")).toBeVisible();
        await hud.getByRole("button", { name: "End tour" }).click();
        await expect(hud.getByText("Demo complete")).toBeVisible();

        await page.getByRole("link", { name: "Meetings" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings$/);
        await expect(
            page.getByText("Archived", { exact: true }).first()
        ).toBeVisible();

        await page.goto(
            "/demo/meetings/a0000000-0000-4000-8000-000000000001?chapter=chapter-closing&tab=closing"
        );
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});

