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
        const radio = picker.getByRole("radio", { name: /credit-evidence\.md/ });
        await radio.focus();
        await page.keyboard.press("Space");
        const confirm = picker.getByRole("button", { name: "Add sample" });
        await confirm.focus();
        await page.keyboard.press("Enter");
        await expect(picker).toBeHidden();
        await expect(page.getByText("Ready (2 chunks)")).toBeVisible({
            timeout: 30_000,
        });

        const preview = page.getByRole("button", {
            name: "Preview evidence: credit-evidence.md",
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
});
