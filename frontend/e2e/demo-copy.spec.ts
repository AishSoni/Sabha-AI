import { test, expect, type Page } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

/**
 * Copy acceptance (spec-30 journey D).
 *
 * The concise journey deleted the old step panel and receipt, so no retired
 * instruction, production-only disclaimer, or mandatory review label may
 * survive in rendered demo copy. Prepared, historical, authored, and evidence
 * notices stay.
 */
const MEETING_ID = "a0000000-0000-4000-8000-000000000001";

const BANNED = [
    "Skip to prepared result",
    "Replay this prepared turn",
    "Resume guided journey",
    "Guided replay",
    "Start guided replay",
    "Practice setup created",
    "Documents in this step",
    "Chapters and inspection screens",
    "Continue (acknowledge)",
    "Review the formal disagreement",
    "Review the formal consensus",
    "This meeting is read-only.",
];

async function expectNoBannedCopy(page: Page) {
    const text = await page.locator("body").innerText();
    for (const phrase of BANNED) {
        expect(text, `retired copy: ${phrase}`).not.toContain(phrase);
    }
    expect(text).not.toMatch(/\bDirector\b/);
    expect(text).not.toMatch(/Step \d+ of 8/);
}

test.describe("concise demo copy", () => {
    test("retires the step panel vocabulary and keeps prepared evidence notices", async ({
        page,
        context,
    }) => {
        test.setTimeout(180_000);
        const network = guardNetwork(page);
        await serveRecordedAssets(page);

        await page.goto("/");
        await expect(
            page
                .locator(".home-hero")
                .getByRole("link", { name: "Try the recorded demo" }),
        ).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto("/demo");
        await expect(page.getByTestId("tutorial-hud")).toBeVisible();
        await expect(
            page.getByText(
                "Recorded responses, not live AI generation · as of 31 July 2020"
            )
        ).toHaveCount(1);
        await expectNoBannedCopy(page);

        await page.goto("/demo/new");
        await expect(
            page.getByText("Prepared document supplied with the recording.")
        ).toBeVisible();
        await page.getByRole("button", { name: "Try editing this setup" }).click();
        await expect(
            page.getByRole("heading", { name: "Practice setup" }).first()
        ).toBeVisible();
        await expect(
            page.getByText(/Practice only · changes stay in this browser/)
        ).toBeVisible();
        await expectNoBannedCopy(page);

        await page.getByRole("button", { name: "Add approved sample" }).click();
        const samplePicker = page.getByRole("dialog");
        await samplePicker
            .getByRole("radio", { name: /downside-worksheet\.md/ })
            .check();
        await samplePicker.getByRole("button", { name: "Add sample" }).click();
        await page.getByRole("button", { name: "Create practice setup" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/local-/, {
            timeout: 30_000,
        });
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(page.getByTestId("tutorial-hud-compact")).toHaveCount(0);
        await expect(
            page.getByText("Practice setup", { exact: true }).first()
        ).toBeVisible();
        await expect(
            page.getByText("What this setup does not do", { exact: true })
        ).toBeVisible();
        await expect(
            page.getByText(/It does not send a turn, generate a reply/)
        ).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto(`/demo/meetings/${MEETING_ID}?tab=chat`);
        await expect(
            page.getByRole("heading", { name: /Review HDFC Ltd/ })
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByText(/Prepared historical committee review/)
        ).toBeVisible();
        await page.getByRole("button", { name: "Details" }).click();
        const details = page.getByRole("dialog");
        await expect(details).toBeVisible();
        await expect(details.getByText("Recorded", { exact: true })).toBeVisible();
        await expect(details.getByText("Status", { exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expectNoBannedCopy(page);

        await page.goto(
            `/demo/meetings/${MEETING_ID}?chapter=chapter-files&tab=documents`
        );
        await expect(
            page.getByRole("heading", { name: "Retained source material" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByRole("heading", { name: "Prepared for this replay" })
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Demo-authored participant inputs" })
        ).toBeVisible();
        await expect(
            page.getByText("Demo-authored private input", { exact: true })
        ).toHaveCount(3);
        await page
            .getByRole("button", { name: "Preview evidence: Crisil annexure" })
            .click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel("Evidence provenance")).toContainText(
            "Retained source material"
        );
        await expectNoBannedCopy(page);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();

        await page.goto(
            `/demo/meetings/${MEETING_ID}?chapter=chapter-summary&tab=summary`
        );
        await expect(
            page.getByRole("heading", { name: "Recorded summary" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Recorded system summary")).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto(
            `/demo/meetings/${MEETING_ID}?chapter=chapter-closing&tab=closing`
        );
        await expect(
            page.getByRole("heading", { name: "Final summary" })
        ).toBeVisible({ timeout: 30_000 });
        await expectNoBannedCopy(page);

        await page.goto("/demo/roster/persona-credit");
        await expect(
            page.getByRole("heading", { name: "The Credit Analyst" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByText(/Prepared participant vs practice template/)
        ).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto("/demo/knowledge-stacks/credit-private");
        await expect(
            page.getByRole("heading", {
                name: "Credit evidence (private to The Credit Analyst)",
            })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Saved practice participants")).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto("/demo/meetings");
        await expect(
            page.getByRole("button", { name: "Archived" })
        ).toBeVisible();
        await expectNoBannedCopy(page);

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
