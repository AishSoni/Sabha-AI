import { test, expect, type Page } from "./support/demo-test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

/**
 * Recorded-log notices (spec-29): optional side channel, never a gate.
 *
 * The formal Disagreements and Consensus tabs stay authoritative. A notice
 * may open one of those tabs, but ignoring or dismissing it never advances,
 * blocks, or rewrites the meeting.
 */
async function startRecording(page: Page) {
    const network = guardNetwork(page);
    await page.goto("/demo");
    const hud = page.getByTestId("tutorial-hud");
    await expect(hud.getByText("Start the meeting")).toBeVisible();
    await page.getByRole("link", { name: "Start meeting" }).click();
    await expect(page).toHaveURL(/\/demo\/new$/);
    await page.getByRole("button", { name: "Create meeting" }).click();
    await expect(page.getByRole("heading", { name: "Meeting created" })).toBeVisible();
    await page.getByRole("link", { name: "Open the meeting room" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+/);
    return { hud, network };
}

test.describe("recorded log notices", () => {
    test("notify once, open the formal tab, and never gate the meeting", async ({
        page,
        context,
    }) => {
        test.setTimeout(180_000);
        const { hud, network } = await startRecording(page);
        const notices = page.getByTestId("tutorial-notices");
        const close = page.getByRole("button", { name: "Close meeting" });

        await page.getByRole("button", { name: "Ask Arjun, Downside Reviewer for an opening view" }).click();
        await expect(notices.getByText("Disagreement logged")).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            notices.getByText("Rating alone is insufficient")
        ).toBeVisible();
        // The two decisions stay independent: the notice does not unlock the
        // close action and does not replace the current tip.
        await expect(close).toBeDisabled();
        await expect(hud.getByText("Choose who speaks next")).toBeVisible();
        await expect(page.getByRole("button", { name: /Continue/ })).toHaveCount(0);

        await page.getByRole("button", { name: "Ask Mira, Credit Analyst for an opening view" }).click();
        await page.getByRole("button", { name: "Ask Leena, Portfolio Analyst for an opening view" }).click();
        await page.getByRole("button", { name: /Committee alignment/ }).click();
        await expect(notices.getByText("Consensus logged")).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            notices.getByText(
                "Research checklist separates facts, judgments, and unknowns"
            )
        ).toBeVisible();
        await page.getByRole("button", { name: "Send question" }).click();
        await expect(close).toBeEnabled({ timeout: 30_000 });

        // The notices can sit on screen while the closing confirmation is
        // open; closing is a panel decision, not a review gate.
        await close.click();
        await expect(page.getByRole("heading", { name: "Close Meeting" })).toBeVisible();
        await expect(notices).toBeVisible();
        await page.getByRole("button", { name: /Vote to End/ }).click();
        await expect(
            page.getByRole("heading", { name: "Ask the board to end this meeting?" })
        ).toBeVisible();
        await expect(notices).toBeVisible();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(notices).toBeVisible();

        // View removes the side-channel copy, opens the formal tab, and puts
        // focus on its heading rather than on a control the visitor must press.
        await notices.getByRole("button", { name: "View" }).nth(1).click();
        await expect(page).toHaveURL(/tab=consensus/);
        await expect(page.locator("#consensus-heading")).toBeFocused();
        await expect(notices.getByText("Consensus logged")).toHaveCount(0);

        await page.getByRole("tab", { name: "Chat" }).click();
        await notices
            .getByRole("button", { name: "Dismiss Disagreement logged" })
            .click();
        await expect(notices).toHaveCount(0);

        // Dismissing the notice leaves the authoritative record in its tab.
        await page.getByRole("tab", { name: "Disagreements" }).click();
        await expect(
            page.getByText("Rating alone is insufficient").first()
        ).toBeVisible();

        // A recorded chapter is inspection, not a new event stream: returning
        // to the consensus snapshot cannot replay the notice.
        await page.locator('summary[aria-label="Explore demo"]:visible').click();
        await page.getByRole("link", { name: "Consensus" }).click();
        await expect(page).toHaveURL(/chapter=chapter-consensus/);
        await expect(
            page.getByText(
                "Research checklist separates facts, judgments, and unknowns"
            ).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("tutorial-notices")).toHaveCount(0);

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
