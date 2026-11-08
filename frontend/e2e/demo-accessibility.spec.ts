import { test, expect } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";
import { serveRecordedAssets } from "./support/recorded-assets";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("demo keyboard and narrow-screen accessibility", () => {
    test("reaches revision, picker, and preview controls without a pointer", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await serveRecordedAssets(page);

        await page.goto("/demo/roster/persona-credit/history");
        await expect(
            page.getByRole("heading", { name: "The Credit Analyst" })
        ).toBeVisible();

        const view = page.getByRole("button", { name: "View version 1" });
        await view.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByLabel("Version 1 content")).toBeVisible();

        const prompt = page.getByPlaceholder(
            "Define this persona's personality, expertise, and behavior..."
        );
        await prompt.focus();
        await page.keyboard.type("Keyboard-only practice marker.");
        const save = page.getByRole("button", { name: "Save as New Version" });
        await save.focus();
        await page.keyboard.press("Enter");
        await expect(
            page.getByText(/Saved version 4 and made it active\./)
        ).toBeVisible();

        const activate = page.getByRole("button", {
            name: "Make version 1 active",
        });
        await activate.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByText("Version 1 is now active.")).toBeVisible();

        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1
            )
        ).toBe(true);

        await page.getByRole("link", { name: "Knowledge" }).click();
        await page
            .locator('a[href="/demo/knowledge-stacks/credit-private"]')
            .click();
        const add = page.getByRole("button", { name: "Add sample" });
        await add.focus();
        await page.keyboard.press("Enter");
        const picker = page.getByRole("dialog");
        await expect(picker).toBeVisible();
        const radio = picker.getByRole("radio", { name: /portfolio-mandate\.md/ });
        await radio.focus();
        await page.keyboard.press("Space");
        const confirm = picker.getByRole("button", { name: "Add sample" });
        await confirm.focus();
        await page.keyboard.press("Enter");
        await expect(picker).toBeHidden();
        await expect(page.getByText("Ready (3 chunks)")).toBeVisible({
            timeout: 30_000,
        });

        const preview = page.getByRole("button", {
            name: "Preview evidence: portfolio-mandate.md",
        });
        await preview.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(preview).toBeFocused();

        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1
            )
        ).toBe(true);

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("operates tips, notices, and an optional tour from the keyboard", async ({
        page,
        context,
    }) => {
        test.setTimeout(180_000);
        const network = guardNetwork(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/demo");

        const hud = page.getByTestId("tutorial-hud");
        const progress = hud.getByRole("progressbar", {
            name: "Demo progress",
        });
        await expect(hud).toHaveAccessibleName("Demo tutorial");
        await expect(hud).toHaveAttribute("role", "region");
        await expect(page.getByRole("dialog")).toHaveCount(0);

        await hud.getByLabel("Explore demo").click();
        await page
            .getByRole("button", { name: "Hide", exact: true })
            .focus();
        await page.keyboard.press("Enter");
        await expect(hud).toHaveCount(0);
        const show = page.getByRole("button", { name: "Show tips" });
        await show.focus();
        await page.keyboard.press("Enter");
        await expect(hud.getByText("Start the meeting")).toBeVisible();

        await page.getByRole("link", { name: "Start meeting" }).focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/demo\/new$/);
        const create = page.getByRole("button", { name: "Create meeting" });
        await create.focus();
        await page.keyboard.press("Enter");
        const open = page.getByRole("link", { name: "Open the meeting room" });
        await open.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/demo\/meetings\//);

        await page.getByRole("button", { name: "Downside challenge" }).focus();
        await page.keyboard.press("Enter");
        const notices = page.getByTestId("tutorial-notices");
        await expect(notices.getByText("Disagreement logged")).toBeVisible({
            timeout: 30_000,
        });
        await notices
            .getByRole("button", { name: "Dismiss Disagreement logged" })
            .focus();
        await page.keyboard.press("Enter");
        await expect(notices).toHaveCount(0);
        await page
            .getByRole("button", { name: "Record", exact: true })
            .click();
        await page.getByRole("tab", { name: "Disagreements" }).click();
        await expect(
            page.getByText("Rating alone is insufficient").first()
        ).toBeVisible();
        await page.getByRole("button", { name: "Back to discussion" }).click();
        await page.getByRole("tab", { name: "Chat" }).click();

        const expectedProgress = [
            { value: "45", instruction: "Choose who speaks next" },
            { value: "48", instruction: "Choose who speaks next" },
            { value: "50", instruction: "Send your follow-up" },
        ];
        for (const [index, name] of [
            "Credit Analyst opening facts",
            "Mandate review",
            "Committee alignment",
        ].entries()) {
            const action = page.getByRole("button", { name });
            await expect(action).toBeEnabled();
            await action.focus();
            await page.keyboard.press("Enter");
            await expect(progress).toHaveAttribute(
                "aria-valuenow",
                expectedProgress[index].value,
                { timeout: 30_000 }
            );
            await expect(
                hud.getByText(expectedProgress[index].instruction)
            ).toBeVisible({ timeout: 30_000 });
        }
        const send = page.getByRole("button", { name: "Send question" });
        await expect(send).toBeVisible({ timeout: 30_000 });
        await send.focus();
        await page.keyboard.press("Enter");
        await expect(hud.getByText("Close the meeting")).toBeVisible({
            timeout: 30_000,
        });
        await page.getByRole("button", { name: "Close meeting" }).focus();
        await page.keyboard.press("Enter");
        await expect(
            page.getByRole("button", { name: "Vote to End" })
        ).toBeVisible();
        await page.getByRole("button", { name: "Vote to End" }).focus();
        await page.keyboard.press("Enter");
        await page.getByRole("button", { name: "Start Vote" }).focus();
        await page.keyboard.press("Enter");
        await expect(
            page.getByText(/The committee voted to conclude/).first()
        ).toBeVisible({ timeout: 30_000 });
        await page.getByRole("link", { name: "Go to meetings" }).focus();
        await page.keyboard.press("Enter");
        await page.getByTestId("archive-meeting").focus();
        await page.keyboard.press("Enter");
        await expect(hud.getByText("Demo complete")).toBeVisible({
            timeout: 30_000,
        });
        await page.evaluate(() => window.scrollTo(0, 0));

        await hud
            .getByRole("button", { name: "Explore prompt versions" })
            .focus();
        await page.keyboard.press("Enter");
        await expect(hud.getByText("Open a persona")).toBeVisible();
        await hud.getByRole("button", { name: "End tour" }).focus();
        await page.keyboard.press("Enter");
        await expect(hud.getByText("Demo complete")).toBeVisible();

        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1
            )
        ).toBe(true);

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("stays usable at 200 percent zoom without horizontal overflow", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        // 200% zoom on a 1280x720 window lays out in a 640x360 CSS viewport.
        await page.setViewportSize({ width: 640, height: 360 });
        await page.goto("/demo");

        const start = page.getByRole("link", { name: "Start meeting" });
        await start.scrollIntoViewIfNeeded();
        const hud = page.getByTestId("tutorial-hud");
        await expect(hud.getByText("Start the meeting")).toBeVisible();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1
            )
        ).toBe(true);

        await start.click();
        await expect(page).toHaveURL(/\/demo\/new$/);
        const create = page.getByRole("button", {
            name: "Create meeting",
        });
        await create.scrollIntoViewIfNeeded();
        await expect(hud.getByText("Create meeting")).toBeVisible();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1
            )
        ).toBe(true);

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("explains operator-only settings without credential controls", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await page.goto("/demo/settings");

        await expect(
            page.getByRole("heading", { name: "Demo settings" })
        ).toBeVisible();
        // The tutorial objective has no anchor on this screen, so the card
        // stays collapsed instead of guessing a position.
        await expect(page.getByTestId("tutorial-hud-compact")).toBeVisible();
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(
            page.getByRole("heading", { name: "Provider setup is operator-only" })
        ).toBeVisible();
        await expect(
            page.getByText(/managed only in the authenticated operator workspace/i)
        ).toBeVisible();
        await expect(page.getByRole("textbox")).toHaveCount(0);
        await expect(page.getByLabel(/api key/i)).toHaveCount(0);

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });
});
