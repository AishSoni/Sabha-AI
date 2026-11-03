import { test, expect } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

// Spec 28 supersedes the ordered eight-beat journey. Spec 29 replaces this
// panel with the contextual HUD and re-enables the equivalent browser checks.
test.describe.skip("guided bond journey (superseded by spec-28)", () => {
    test("walks the prepared HDFC replay through archive", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);

        await page.goto("/");
        await page.evaluate(() => window.localStorage.clear());
        await page.goto("/demo");

        await expect(
            page.getByRole("heading", { name: /Prepared board/ })
        ).toBeVisible();
        await expect(page.getByText("Guided replay").first()).toBeVisible();
        await expect(page.getByText(/Information as of 31 July 2020/).first()).toBeVisible();

        const knowledge = page.locator("summary").filter({ hasText: "Knowledge assignments" });
        await expect(knowledge).toHaveCount(3);
        for (let index = 0; index < 3; index += 1) {
            await knowledge.nth(index).click();
        }
        await page.getByRole("link", { name: "Start the meeting" }).click();
        await expect(page).toHaveURL(/\/demo\/new$/);
        await expect(page.getByText(/Step 2 of 8/)).toBeVisible();

        await expect(
            page.getByText(/Prepared preset — editing is disabled/)
        ).toBeVisible();
        await page.getByRole("button", { name: "Create recorded meeting" }).click();
        await expect(page.getByText("Recorded intake ready")).toBeVisible();
        // The checkpoint advances with the real action. Opening the room is the
        // app action for this step, so the visitor does not need the guide
        // panel's Continue button here.
        await expect(page.getByText(/Step 3 of 8/)).toBeVisible({ timeout: 30_000 });
        await page.getByRole("link", { name: "Open the meeting room" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+\?tab=chat$/);
        await expect(page.getByText(/Step 3 of 8/)).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

        const stepDocuments = page.getByTestId("guide-step-documents");
        await expect(stepDocuments).toContainText("Shared fact sheet");
        await expect(stepDocuments).toContainText("Credit evidence");
        await expect(
            page.getByRole("button", { name: "You" })
        ).toBeDisabled();
        await page.getByTestId("you-disabled-trigger").focus();
        await expect(page.getByRole("tooltip")).toHaveText(
            "Only available in the live workspace."
        );

        await page.getByRole("button", { name: "Ask the Credit Analyst" }).click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Step 4 of 8/)).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: /5 Sources/ }).first().click();
        await expect(
            page.getByText(/CRISIL Rating Rationale/i).first()
        ).toBeVisible();

        await page.getByRole("button", { name: "Ask the Downside Reviewer" }).click();
        await expect(
            page.getByText(/I disagree with treating AAA\/Stable as sufficient comfort/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByRole("tab", { name: /Disagreements 1/ })
        ).toBeVisible({ timeout: 30_000 });
        // The next Director and participant actions belong to later guided
        // steps and must not be offered before this review is acknowledged.
        await expect(
            page.getByRole("button", { name: "Send the supported follow-up" })
        ).toHaveCount(0);
        await expect(
            page.getByRole("button", { name: "Ask the Portfolio Analyst" })
        ).toHaveCount(0);
        await page.getByRole("tab", { name: /Disagreements 1/ }).click();
        await page
            .getByTestId("guide-review")
            .getByRole("button", { name: "Continue" })
            .click();
        await expect(page.getByText(/Step 5 of 8/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute(
            "aria-selected",
            "true"
        );
        await page.getByRole("tab", { name: "Files" }).click();
        await expect(
            page.getByText("hdfc-v007-shared-fact-sheet.md")
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Demo-authored participant inputs" })
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Preview evidence: Credit evidence" })
        ).toBeVisible();
        await expect(
            page.getByRole("button", {
                name: "Preview evidence: Downside worksheet",
            })
        ).toBeVisible();
        await expect(
            page.getByRole("button", {
                name: "Preview evidence: Portfolio mandate",
            })
        ).toBeVisible();
        await page.getByRole("tab", { name: "Chat" }).click();

        await page.getByRole("button", { name: "Send the supported follow-up" }).click();
        await expect(
            page.getByRole("button", { name: "Send the supported follow-up" })
        ).toHaveCount(0, { timeout: 30_000 });
        await expect(page.getByText(/Step 5 of 8/)).toBeVisible();
        await page.getByRole("button", { name: "Ask the Portfolio Analyst" }).click();
        await expect(
            page.getByText(/The mandate cannot be completed from this record/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Step 6 of 8/)).toBeVisible({ timeout: 30_000 });

        await page.getByRole("button", { name: "Ask the committee to align" }).click();
        await expect(
            page.getByText(/The committee can align on a bounded checklist/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("tab", { name: /Consensus 1/ }).click();
        await page
            .getByTestId("guide-review")
            .getByRole("button", { name: "Continue" })
            .click();
        await expect(page.getByText(/Step 7 of 8/)).toBeVisible({ timeout: 30_000 });

        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+\?tab=closing$/);
        await expect(page.getByText(/Step 7 of 8/)).toBeVisible();
        await page.getByRole("button", { name: "Close meeting" }).click();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Step 8 of 8/)).toBeVisible({ timeout: 30_000 });
        await page.getByRole("link", { name: "Go to meetings" }).click();

        await expect(page).toHaveURL(/\/demo\/meetings$/);
        await expect(page.getByText(/Step 8 of 8/)).toBeVisible();
        await page.getByTestId("archive-meeting").click();
        await expect(
            page.getByText(/Archived overlay recorded/)
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/remains ended/).first()).toBeVisible();
        await expect(
            page.getByText(/Unarchive and delete are unavailable in guided replay/)
        ).toBeVisible();
        // Archiving is the final recorded action, so the guide completes
        // without a separate Finish acknowledgement.
        await expect(page.getByText("Journey complete")).toBeVisible({
            timeout: 30_000,
        });

        await page.getByRole("button", { name: "Back" }).click();
        await expect(page.getByText(/Step 8 of 8/)).toBeVisible({
            timeout: 60_000,
        });
        // Back rewinds the inspected snapshot but does not erase the completed
        // canonical journey. The list may retain its archived tab, so return
        // to the active/ended view to inspect the pre-archive snapshot.
        await expect(page.getByText("Journey complete")).toBeVisible();
        await page.getByRole("button", { name: "Active and ended" }).click();
        // The recorded archive is already settled, so the action cannot be
        // submitted a second time from the rewound snapshot.
        await expect(page.getByTestId("archive-meeting")).toBeDisabled({
            timeout: 60_000,
        });
        await expect(page.getByTestId("archive-meeting")).toHaveAttribute(
            "title",
            "This action is only available in the archive step"
        );
        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("keeps the guide keyboard-accessible and resets on a deep link", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/demo");

        await expect(page.getByText(/Step 1 of 8/)).toBeVisible();
        expect(
            await page.evaluate(() =>
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
            )
        ).toBe(true);

        const continueButton = page.getByRole("button", { name: "Continue" });
        await continueButton.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/demo\/new$/);
        await expect(page.locator('input[type="file"]')).toHaveCount(0);

        await page.getByRole("button", { name: "Back" }).click();
        await expect(page).toHaveURL(/\/demo$/);
        // Back moves the exploration cursor; it does not un-acknowledge the
        // completed board step, so the guide remains on step 2.
        await expect(page.getByText(/Step 2 of 8/)).toBeVisible();

        await page.getByRole("button", { name: "Restart" }).click();
        await expect(page.getByText(/Step 1 of 8/)).toBeVisible();

        await page.goto("/demo/meetings/a0000000-0000-4000-8000-000000000001");
        await expect(page).toHaveURL(/\/demo$/);
        await expect(
            page.getByRole("heading", { name: /Prepared board/ })
        ).toBeVisible();
        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
