import { test, expect, type Page } from "./support/demo-test";
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
    "Practice setup",
    "Try editing this setup",
    "Create practice setup",
    "Open practice setup",
    "Documents in this step",
    "Chapters and inspection screens",
    "Continue (acknowledge)",
    "Review the formal disagreement",
    "Review the formal consensus",
    "This meeting is read-only.",
    "Try the recorded demo",
    "Prepared demo",
    "Recorded session",
    "Recorded summary",
    "Recorded closing",
    "Replay last turn",
    "Prepared for this replay",
    "Prepared participants",
    "Prepared setup",
    "Recorded meeting",
    "Recorded creation",
    "Recorded intake",
    "Recorded board",
    "Recorded evidence",
    "Recorded replay",
    "Recording creation",
];

async function expectNoBannedCopy(page: Page) {
    const text = await page.locator("body").innerText();
    const accessible = await page
        .locator("[aria-label], [title], img[alt], input[placeholder]")
        .evaluateAll((nodes) =>
            nodes.flatMap((node) =>
                [
                    node.getAttribute("aria-label"),
                    node.getAttribute("title"),
                    node.getAttribute("alt"),
                    node.getAttribute("placeholder"),
                ].filter((value): value is string => Boolean(value))
            )
        );
    const haystack = [text, ...accessible].join("\n");
    for (const phrase of BANNED) {
        expect(haystack, `retired copy: ${phrase}`).not.toContain(phrase);
    }
    expect(haystack).not.toMatch(/\bDirector\b/);
    expect(haystack).not.toMatch(/Step \d+ of 8/);
    expect(haystack).not.toMatch(/Recorded demo(?! excerpt)/i);
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
                .getByRole("link", { name: "Try the demo" }),
        ).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto("/demo");
        await expect(page.getByTestId("tutorial-hud")).toBeVisible();
        await expect(
            page.getByText(
                "Responses were recorded, not live AI generation"
            )
        ).toHaveCount(1);
        await expectNoBannedCopy(page);

        await page.goto("/demo/new");
        await expect(
            page.getByText("Document supplied with the demo.")
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Added samples" })
        ).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto(`/demo/meetings/${MEETING_ID}?tab=chat`);
        await expect(
            page.getByRole("heading", { name: /A HDFC Bond Review Demo/ })
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByText(/Historical committee review/)
        ).toBeVisible();
        await page.getByRole("button", { name: "Details" }).click();
        const details = page.getByRole("dialog");
        await expect(details).toBeVisible();
        await expect(details.getByText("Demo", { exact: true })).toBeVisible();
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
            page.getByRole("heading", { name: "Included in this demo" })
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Participant inputs" })
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
            page.getByRole("heading", { name: "Summary" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("System summary")).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto(
            `/demo/meetings/${MEETING_ID}?chapter=chapter-closing&tab=closing`
        );
        await expect(
            page.getByRole("heading", { name: "What this discussion produced" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Saved result")).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto("/demo/roster/persona-credit");
        await expect(
            page.getByRole("heading", { name: "Mira" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByText(/Participant vs persona template/)
        ).toBeVisible();
        await expectNoBannedCopy(page);

        await page.goto("/demo/knowledge-stacks/credit-private");
        await expect(
            page.getByRole("heading", {
                name: "Credit evidence (private to Mira)",
            })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Saved participants")).toBeVisible();
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
