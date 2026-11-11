import { test, expect, type Page } from "./support/demo-test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

/**
 * Original package compatibility (spec-27) on the spec-29 tutorial HUD.
 *
 * The approved version-5 HDFC package predates the prepared turn deck. The
 * eight recorded beats still complete, but the only guidance is one anchored
 * instruction at a time; there is no Continue/acknowledge flow.
 */
async function openVersionFiveBoard(page: Page) {
    const [response] = await Promise.all([
        page.waitForResponse(
            (candidate) =>
                new URL(candidate.url()).pathname === "/api/replay/session" &&
                candidate.status() === 200
        ),
        page.goto("/demo"),
    ]);
    const session = (await response.json()) as { package_version: string };
    expect(session.package_version).toBe("5");
}

test.describe("version-5 package compatibility", () => {
    test.skip(
        process.env.E2E_LEGACY !== "1",
        "run through npm run test:e2e:legacy so the backend serves version 5"
    );

    test("walks the original eight recorded beats with one tip at a time", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await openVersionFiveBoard(page);

        await expect(
            page.getByRole("heading", { name: /Prepared board/ })
        ).toBeVisible();
        await expect(
            page.getByText(
                /Responses were recorded, not live AI generation/
            ).first()
        ).toBeVisible();
        await expect(
            page.getByText("Chapters and inspection screens")
        ).toHaveCount(0);

        const hud = page.getByTestId("tutorial-hud");
        await expect(hud.getByText("Meet the board")).toBeVisible();
        await expect(
            page.getByRole("button", { name: /Continue/ })
        ).toHaveCount(0);

        const knowledge = page
            .locator("summary")
            .filter({ hasText: "Knowledge assignments" });
        await expect(knowledge).toHaveCount(3);
        for (let index = 0; index < 3; index += 1) {
            await knowledge.nth(index).click();
        }

        await page.getByRole("link", { name: "Start meeting" }).click();
        await expect(page).toHaveURL(/\/demo\/new$/);
        await expect(
            page.getByRole("heading", { name: "Added samples" })
        ).toBeVisible();
        await expect(hud.getByText("Create meeting")).toBeVisible();

        await page.getByRole("button", { name: "Create meeting" }).click();
        await expect(page.getByRole("heading", { name: "Meeting created" })).toBeVisible();
        await expect(hud.getByText("Open the meeting room")).toBeVisible({
            timeout: 30_000,
        });

        await page.getByRole("link", { name: "Open the meeting room" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+(?:\?.*)?$/);

        await expect(
            hud.getByText("Ask the Credit Analyst")
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Ask the Credit Analyst" }).click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(hud.getByText("Ask the Downside Reviewer")).toBeVisible({
            timeout: 30_000,
        });

        await page.getByRole("button", { name: "Ask the Downside Reviewer" }).click();
        await expect(
            page.getByText(/I disagree with treating AAA\/Stable as sufficient comfort/).first()
        ).toBeVisible({ timeout: 30_000 });
        // The disagreement is a dismissible notice, never a required review.
        await expect(
            page.getByText("Disagreement logged").first()
        ).toBeVisible({ timeout: 30_000 });
        await page
            .getByRole("button", { name: "Dismiss Disagreement logged" })
            .click();
        await expect(
            hud.getByText("Send your follow-up")
        ).toBeVisible({ timeout: 30_000 });

        await page.getByRole("button", { name: "Send the supported follow-up" }).click();
        await expect(
            page.getByRole("button", { name: "Send the supported follow-up" })
        ).toHaveCount(0, { timeout: 30_000 });
        await expect(
            hud.getByText("Ask the Portfolio Analyst")
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: "Ask the Portfolio Analyst" }).click();
        await page.getByRole("tab", { name: "Chat" }).click();
        await expect(
            page.getByText(/The mandate cannot be completed from this record/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(hud.getByText("Ask the committee to align")).toBeVisible({
            timeout: 30_000,
        });

        await page.getByRole("button", { name: "Ask the committee to align" }).click();
        await expect(
            page.getByText(/The committee can align on a bounded checklist/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(hud.getByText("Close the meeting")).toBeVisible({
            timeout: 30_000,
        });

        await page.getByRole("button", { name: "Close meeting" }).click();
        await expect(hud.getByText("Vote to end the meeting")).toBeVisible();
        await page.getByRole("button", { name: "Vote to End" }).click();
        await page.getByRole("button", { name: "Start Vote" }).click();
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByTestId("tutorial-announcement")
        ).toContainText("Return to the meetings list");

        await page.getByRole("link", { name: "Go to meetings" }).click();
        await expect(page).toHaveURL(/\/demo\/meetings$/);
        await page.getByTestId("archive-meeting").scrollIntoViewIfNeeded();
        await expect(hud.getByText("Archive the meeting")).toBeVisible();
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
});

