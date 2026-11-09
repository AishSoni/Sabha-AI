import { test, expect, type Page } from "./support/demo-test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

/**
 * Integrated practice exploration (spec-27 journey B, retained for spec-30).
 *
 * Practice templates and stack documents are local to the tab. The recorded
 * turn, citations, closing, and archive remain pinned to the approved
 * package even after edits, sample ingestion, retry, and removal.
 */
const PROMPT =
    "Define this persona's personality, expertise, and behavior...";

async function openBoard(page: Page) {
    const [response] = await Promise.all([
        page.waitForResponse(
            (candidate) =>
                new URL(candidate.url()).pathname === "/api/replay/session" &&
                candidate.status() === 200
        ),
        page.goto("/demo"),
    ]);
    const session = (await response.json()) as { package_version: string };
    expect(session.package_version).toBe("11");
    await expect(page.getByRole("heading", { name: /Demo board/ })).toBeVisible();
    await expect(page.getByTestId("tutorial-hud")).toBeVisible();
}

async function openPromptHistory(page: Page, name: string) {
    await page.getByRole("link", { name: "Personas" }).click();
    await page.getByRole("link", { name }).click();
    await page.getByRole("tab", { name: "System Prompt" }).click();
}

async function openExploreMenu(page: Page) {
    await page.locator('summary[aria-label="Explore demo"]:visible').click();
}

test.describe("integrated practice exploration", () => {
    test("edits, samples, and removal never change the recorded turn", async ({
        page,
        context,
    }) => {
        test.setTimeout(240_000);
        const network = guardNetwork(page);
        page.on("dialog", (dialog) => void dialog.accept());
        await serveRecordedAssets(page);
        await openBoard(page);

        const recordedSummary = page.getByText(
            /You are Mira\. Test the record/
        );
        await expect(recordedSummary.first()).toBeVisible();

        // Detour into the persona template history.
        await openPromptHistory(page, "Mira");
        await expect(
            page.getByRole("heading", { name: "Mira" })
        ).toBeVisible();

        await page.getByRole("button", { name: "View version 1" }).click();
        await expect(page.getByLabel("Version 1 content")).toBeVisible();
        await expect(page.getByText("Viewing only — not active.")).toBeVisible();

        const prompt = page.getByPlaceholder(PROMPT);
        await prompt.fill(
            "Practice edit marker: this prompt never reaches the recording."
        );
        await page.getByRole("button", { name: "Save and activate new version" }).click();
        await expect(
            page.getByText(/Saved and activated version 4\./)
        ).toBeVisible();

        await page.getByRole("button", { name: "Make version 1 active" }).click();
        await expect(page.getByText("Version 1 is now active.")).toBeVisible();

        // The prepared participant shown beside the template is unchanged.
        await expect(
            page.getByRole("heading", {
                name: "Participant vs persona template",
            })
        ).toBeVisible();

        // Open the assigned credit stack and stage a permitted sample.
        await page.getByRole("link", { name: "Knowledge" }).click();
        await expect(
            page.getByRole("heading", { name: "Knowledge Stacks" })
        ).toBeVisible();
        await page
            .locator('a[href="/demo/knowledge-stacks/credit-private"]')
            .click();
        await expect(
            page.getByRole("heading", {
                name: "Credit evidence (private to Mira)",
            })
        ).toBeVisible();

        // The credit stack is seeded with the prepared credit evidence.
        await expect(page.getByText("Ready (2 chunks)")).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.getByText("Saved participants")).toBeVisible();
        await expect(page.getByText("Mira").first()).toBeVisible();

        // The ready document previews real recorded bytes, not a mock.
        await page
            .getByRole("button", { name: "Preview evidence: credit-evidence.md" })
            .click();
        const preview = page.getByRole("dialog");
        await expect(preview).toBeVisible();
        await expect(
            preview.getByRole("region", { name: "Evidence provenance" })
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(preview).toBeHidden();

        // The prepared fail-once sample fails honestly and succeeds on retry.
        await page.getByRole("button", { name: "Add sample" }).click();
        const picker = page.getByRole("dialog");
        await picker
            .getByRole("radio", { name: /downside-worksheet\.md/ })
            .check();
        await picker.getByRole("button", { name: "Add sample" }).click();
        await expect(picker).toBeHidden();
        await expect(page.getByText("Failed", { exact: true })).toBeVisible({
            timeout: 30_000,
        });
        await page
            .getByRole("button", { name: "Retry downside-worksheet.md" })
            .click();
        await expect(page.getByText("Ready (3 chunks)")).toBeVisible({
            timeout: 30_000,
        });

        // Removing a document changes practice eligibility immediately.
        await page
            .getByRole("button", { name: "Delete credit-evidence.md" })
            .click();
        await expect(page.getByText("credit-evidence.md")).toHaveCount(0);
        await expect(page.getByText("downside-worksheet.md").first()).toBeVisible();

        // Return to the recorded deck and request an approved reply.
        await page.goto(
            "/demo/meetings/a0000000-0000-4000-8000-000000000001"
        );
        await expect(
            page.getByRole("button", { name: "Credit Analyst opening facts" })
        ).toBeVisible({ timeout: 30_000 });
        await page
            .getByRole("button", { name: "Credit Analyst opening facts" })
            .click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByText(/Practice edit marker/),
            "practice prompts must never appear in a recorded reply"
        ).toHaveCount(0);

        await page.getByRole("button", { name: /5 Sources/ }).first().click();
        await expect(
            page.getByText(/CRISIL Rating Rationale/i).first()
        ).toBeVisible();
        await page.keyboard.press("Escape");

        // Jump only to approved recorded chapters, then inspect the real archive.
        await openExploreMenu(page);
        await page.getByRole("link", { name: "Closing", exact: true }).click();
        await expect(page).toHaveURL(/chapter=chapter-closing/);
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });

        await openExploreMenu(page);
        await page.getByRole("link", { name: "Archived meeting" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings/);
        await page.getByRole("button", { name: "Archived" }).click();
        await expect(
            page.getByText("Archived", { exact: true }).first()
        ).toBeVisible({ timeout: 30_000 });

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
