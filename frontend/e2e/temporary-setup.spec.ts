import { test, expect } from "./support/demo-test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

async function openPracticeSetup(page: import("@playwright/test").Page) {
    await page.getByRole("link", { name: "Meetings", exact: true }).click();
    await expect(page).toHaveURL(/\/demo\/meetings$/);
    await page.getByRole("link", { name: "Open practice setup" }).click();
    await expect(page.getByText("Captured participants")).toBeVisible();
}

/**
 * Temporary setup without fabricated answers (spec-27 journey C).
 *
 * The creation screen captures persona prompts and stack bindings once. A
 * failed prepared sample can be retried in place, later template edits do not
 * rewrite the capture, and the original recording stays the only transcript.
 */
test.describe("temporary practice setup", () => {
    test("captures a fixed snapshot while the recording stays untouched", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        page.on("dialog", (dialog) => void dialog.accept());
        await serveRecordedAssets(page);

        await page.goto("/demo/new");
        await expect(page).toHaveURL(/\/demo\/new$/);
        await page.getByRole("button", { name: "Try editing this setup" }).click();

        await expect(
            page.getByRole("heading", { name: "Practice setup" })
        ).toBeVisible();
        await expect(
            page.getByText(/changes stay in this browser/)
        ).toBeVisible();

        await page.getByRole("button", { name: "Add approved sample" }).click();
        const picker = page.getByRole("dialog");
        await expect(picker).toBeVisible();
        await picker
            .getByRole("radio", { name: /downside-worksheet\.md/ })
            .check();
        await picker.getByRole("button", { name: "Add sample" }).click();
        await expect(picker).toBeHidden();
        await expect(
            page.getByText("Selected · starts after setup is created")
        ).toBeVisible();

        await page.getByRole("button", { name: "Create practice setup" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+$/);
        await expect(
            page.getByText("Practice only · browser memory")
        ).toBeVisible();
        await expect(page.getByText("Captured participants")).toBeVisible();
        await expect(
            page.getByText("Shared documents in this practice setup")
        ).toBeVisible();

        // The prepared failure is honest and retryable without a new meeting.
        await expect(page.getByText("Failed", { exact: true })).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.getByText(/the first ingestion attempt stopped before indexing/)
        ).toBeVisible();
        await page
            .getByRole("button", { name: "Retry downside-worksheet.md" })
            .click();
        await expect(page.getByText("Ready (3 chunks)")).toBeVisible({
            timeout: 30_000,
        });

        // The captured prompt and stack bindings are visible and frozen.
        const captured = page.locator("details").filter({
            hasText: "Show captured prompt",
        }).first();
        await captured.locator("summary").click();
        const capturedPrompt = await captured.locator("pre").innerText();
        expect(capturedPrompt).toContain("You are Mira");
        expect(capturedPrompt).not.toContain("Practice template changed after setup");
        await expect(page.getByText(/Saved stacks:/).first()).toBeVisible();

        // Change the originating template after the setup was captured.
        await page.getByRole("link", { name: "Personas", exact: true }).click();
        await page.getByRole("link", { name: "Mira" }).click();
        await expect(
            page.getByRole("heading", { name: "Mira" })
        ).toBeVisible();
        await page.getByRole("tab", { name: "System Prompt" }).click();
        const prompt = page.getByPlaceholder(
            "Define this persona's personality, expertise, and behavior..."
        );
        await prompt.fill("Practice template changed after setup.");
        await page.getByRole("button", { name: "Save and activate new version" }).click();
        await expect(
            page.getByText(/Saved and activated version 4\./)
        ).toBeVisible();

        // The captured setup still shows the original prompt and bindings.
        await openPracticeSetup(page);
        const capturedAfter = page.locator("details").filter({
            hasText: "Show captured prompt",
        }).first();
        await capturedAfter.locator("summary").click();
        await expect(capturedAfter.locator("pre")).toHaveText(capturedPrompt);
        await expect(
            page.getByText("Practice template changed after setup.")
        ).toHaveCount(0);

        // Stack contents stay current even though the captured binding is fixed.
        await page.getByRole("link", { name: "Knowledge" }).click();
        await page
            .locator('a[href="/demo/knowledge-stacks/credit-private"]')
            .click();
        await expect(
            page.getByRole("heading", {
                name: "Credit evidence (private to Mira)",
            })
        ).toBeVisible();
        await page.getByRole("button", { name: "Add sample" }).click();
        const stackPicker = page.getByRole("dialog");
        await stackPicker
            .getByRole("radio", { name: /portfolio-mandate\.md/ })
            .check();
        await stackPicker.getByRole("button", { name: "Add sample" }).click();
        await expect(page.getByText("Ready (3 chunks)")).toBeVisible({
            timeout: 30_000,
        });

        // Follow the recording link and prove no custom edit reached it.
        await openPracticeSetup(page);
        await page
            .getByRole("link", { name: "Open original HDFC recording" })
            .click();
        await expect(page).toHaveURL(/\/demo\/meetings\//);
        await expect(
            page.getByRole("heading", {
                name: /A HDFC Bond Review Demo/,
            })
        ).toBeVisible();
        await expect(
            page.getByText("Practice template changed after setup.")
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Ask Mira, Credit Analyst for an opening view" })
        ).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
