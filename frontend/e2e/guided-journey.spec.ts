import { test, expect, type Page } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

/**
 * Spec 30, journeys A and B.
 *
 * The recorded meeting is one concise experience: four prepared AI replies and
 * one **You** follow-up, chosen in any order, with the closing available only
 * after all five required turns.
 */
const FOLLOW_UP =
    "Portfolio Analyst, assume a fictional three-year mandate that requires an executable price, yield, and liquidity assessment. What can you conclude from this record?";

const MESSAGE = {
    credit: "a0000000-0000-4000-8000-000000000402",
    downside: "a0000000-0000-4000-8000-000000000403",
    followUp: "a0000000-0000-4000-8000-000000000404",
    portfolio: "a0000000-0000-4000-8000-000000000405",
    consensus: "a0000000-0000-4000-8000-000000000406",
} as const;

const TURN = {
    credit: "Credit Analyst opening facts",
    downside: "Downside challenge",
    portfolio: "Mandate review",
    consensus: "Committee alignment",
} as const;

async function startRecording(page: Page) {
    const network = guardNetwork(page);
    await page.goto("/demo");

    const hud = page.getByTestId("tutorial-hud");
    await expect(hud).toBeVisible();
    await expect(hud.getByText("Start the meeting")).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue/ })).toHaveCount(0);
    await expect(page.getByText(/Step \d+ of 8/)).toHaveCount(0);
    await expect(
        page.getByText(/Responses were recorded, not live AI generation/)
    ).toHaveCount(1);

    await page.getByRole("link", { name: "Start meeting" }).click();
    await expect(page).toHaveURL(/\/demo\/new$/);
    await expect(hud.getByText("Create meeting")).toBeVisible();

    await page.getByRole("button", { name: "Create meeting" }).click();
    await expect(page.getByRole("heading", { name: "Meeting created" })).toBeVisible();
    await expect(hud.getByText("Open the meeting room")).toBeVisible();

    await page.getByRole("link", { name: "Open the meeting room" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+/);
    await expect(hud.getByText("Choose who speaks next")).toBeVisible();
    return { hud, network };
}

function message(page: Page, id: string) {
    return page.locator(`[data-testid="message"][data-message-id="${id}"]`);
}

async function transcript(page: Page) {
    return page.getByTestId("message").evaluateAll((nodes) =>
        nodes.map((node) => ({
            id: node.getAttribute("data-message-id"),
            type: node.getAttribute("data-sender-type"),
            name: node.getAttribute("data-sender-name"),
        }))
    );
}

async function expectOrderedPlayedSet(
    page: Page,
    replyIds: string[],
    followUpId: string
) {
    const rows = await transcript(page);
    expect(rows.filter((row) => row.type === "ai").map((row) => row.id)).toEqual(
        replyIds
    );
    expect(
        rows.filter((row) => row.type === "user").map((row) => row.id)
    ).toEqual([followUpId]);
    const you = rows.find((row) => row.id === followUpId);
    expect(you?.name).toBe("You");
}

async function expectOrderNeutralSummary(page: Page) {
    const summary = page.getByText(/The committee voted to conclude/).first();
    await expect(summary).toBeVisible({ timeout: 30_000 });
    const text = (await summary.textContent()) ?? "";
    expect(text).not.toMatch(
        /Credit Analyst established|Downside Reviewer|Portfolio Analyst showed/
    );
    expect(text).not.toMatch(/\b(first|then|after|before)\b/i);
}

test.describe("concise recorded journey", () => {
    test("journey A: follow-up first, then the remaining replies in a chosen order", async ({
        page,
        context,
    }) => {
        test.setTimeout(240_000);
        const { hud, network } = await startRecording(page);

        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("0 of 4 replies");
        const close = page.getByRole("button", { name: "Close meeting" });
        await expect(close).toBeDisabled();

        // The follow-up is available before the replies; it is the one **You** turn.
        await page.getByRole("button", { name: "Send question" }).click();
        const you = message(page, MESSAGE.followUp);
        await expect(you).toBeVisible();
        await expect(you).toHaveAttribute("data-sender-name", "You");
        await expect(you).toContainText(FOLLOW_UP);
        await expect(close).toBeDisabled();

        await page.getByRole("button", { name: TURN.downside }).click();
        await expect(message(page, MESSAGE.downside)).toBeVisible({
            timeout: 30_000,
        });
        const disagreement = page
            .getByTestId("tutorial-notices")
            .getByText("Disagreement logged");
        await expect(disagreement).toBeVisible();
        await page
            .getByRole("button", { name: "Dismiss Disagreement logged" })
            .click();
        await expect(disagreement).toHaveCount(0);
        await expect(close).toBeDisabled();

        await page.getByRole("button", { name: TURN.portfolio }).click();
        await expect(message(page, MESSAGE.portfolio)).toBeVisible({
            timeout: 30_000,
        });
        await expect(close).toBeDisabled();

        await page.getByRole("button", { name: TURN.credit }).click();
        await expect(message(page, MESSAGE.credit)).toBeVisible({
            timeout: 30_000,
        });
        await expect(close).toBeDisabled();

        await page.getByRole("button", { name: TURN.consensus }).click();
        await expect(message(page, MESSAGE.consensus)).toBeVisible({
            timeout: 30_000,
        });
        const consensus = page
            .getByTestId("tutorial-notices")
            .getByText("Consensus logged");
        await expect(consensus).toBeVisible();
        await page
            .getByTestId("tutorial-notices")
            .getByRole("button", { name: "View" })
            .click();
        await expect(page).toHaveURL(/tab=consensus/);
        await expect(page.locator("#consensus-heading")).toBeFocused();
        await expect(page.getByRole("button", { name: /Continue/ })).toHaveCount(0);

        // Returning to Chat keeps the composed transcript intact.
        await page.getByRole("tab", { name: "Chat" }).click();
        await expect(message(page, MESSAGE.consensus)).toBeVisible();

        await expectOrderedPlayedSet(
            page,
            [
                MESSAGE.downside,
                MESSAGE.portfolio,
                MESSAGE.credit,
                MESSAGE.consensus,
            ],
            MESSAGE.followUp
        );
        await expect(close).toBeEnabled();

        await close.click();
        await expect(
            page.getByRole("heading", { name: "Close Meeting" })
        ).toBeVisible();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expectOrderNeutralSummary(page);

        await page.getByRole("link", { name: "Go to meetings" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings$/);
        // A target below the fold does not force scroll: the visitor scrolls,
        // then the card anchors to the real control.
        await page.getByTestId("archive-meeting").scrollIntoViewIfNeeded();
        await expect(hud.getByText("Archive the meeting")).toBeVisible();
        await page.getByTestId("archive-meeting").click();
        await expect(hud.getByText("Demo complete")).toBeVisible({
            timeout: 30_000,
        });

        await hud.getByRole("button", { name: "Finish" }).click();
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(page.getByTestId("tutorial-hud-compact")).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("journey B: a different order keeps one reply per turn and a coherent close", async ({
        page,
        context,
    }) => {
        test.setTimeout(240_000);
        const { network } = await startRecording(page);

        const close = page.getByRole("button", { name: "Close meeting" });
        await expect(close).toBeDisabled();

        await page.getByRole("button", { name: TURN.portfolio }).click();
        await expect(message(page, MESSAGE.portfolio)).toBeVisible({
            timeout: 30_000,
        });
        await expect(close).toBeDisabled();

        // Alignment can be chosen before the analyst turns; it must not depend
        // on who spoke first.
        await page.getByRole("button", { name: TURN.consensus }).click();
        await expect(message(page, MESSAGE.consensus)).toBeVisible({
            timeout: 30_000,
        });
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+/);
        await expect(
            page.getByText(/out of order|choose another|not available/i)
        ).toHaveCount(0);
        await expect(close).toBeDisabled();

        await page.getByRole("button", { name: TURN.credit }).click();
        await expect(message(page, MESSAGE.credit)).toBeVisible({
            timeout: 30_000,
        });
        await expect(close).toBeDisabled();

        await page.getByRole("button", { name: TURN.downside }).click();
        await expect(message(page, MESSAGE.downside)).toBeVisible({
            timeout: 30_000,
        });
        await expect(close).toBeDisabled();

        await page.getByRole("button", { name: "Send question" }).click();
        await expect(message(page, MESSAGE.followUp)).toBeVisible();
        await expect(close).toBeEnabled();

        await expectOrderedPlayedSet(
            page,
            [
                MESSAGE.portfolio,
                MESSAGE.consensus,
                MESSAGE.credit,
                MESSAGE.downside,
            ],
            MESSAGE.followUp
        );
        const rows = await transcript(page);
        const played = rows
            .filter((row) => row.type === "ai")
            .map((row) => row.id);
        expect(new Set(played).size).toBe(4);

        await close.click();
        await expect(
            page.getByRole("heading", { name: "Close Meeting" })
        ).toBeVisible();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expectOrderNeutralSummary(page);

        await page.getByRole("button", { name: "Archive meeting" }).click();
        await expect(page.getByText("Meeting archived")).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.getByText(/out of order|choose another/i)).toHaveCount(
            0
        );

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
