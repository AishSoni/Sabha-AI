import { test, expect, type Page } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

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
        await expect(
            hud.getByText("Return to the meetings list")
        ).toBeVisible({ timeout: 30_000 });

        await page.getByRole("link", { name: "Go to meetings" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings$/);
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
        test.use({ viewport: { width: 390, height: 844 } });
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
        await expect(hud).toHaveCSS("transition-property", "none");

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

        await hud.getByRole("button", { name: "Explore knowledge stacks" }).click();
        await expect(hud.getByText("Open knowledge stacks")).toBeVisible();
        await page.getByRole("link", { name: "Knowledge" }).click();
        await expect(hud.getByText("Open a stack")).toBeVisible();
        await page.getByRole("link", { name: "Open â†’" }).first().click();
        await expect(hud.getByText("Inspect a document")).toBeVisible();
        await page.getByRole("button", { name: "Preview source" }).first().click();
        await expect(hud.getByText("Knowledge tour complete")).toBeVisible();
        await hud.getByRole("button", { name: "Finish tour" }).click();
        await expect(hud.getByText("Demo complete")).toBeVisible();
    });
});

