import { test, expect } from "./support/demo-test";
import { seedDemoIntroContext } from "./support/demo-intro";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

const OPERATOR_SESSION = {
    access_token: "synthetic-operator-token",
    refresh_token: "synthetic-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
        id: "11111111-1111-4111-8111-111111111111",
        aud: "authenticated",
        role: "authenticated",
        email: "operator@example.test",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
    },
};

const VAULT_SENTINEL = JSON.stringify({ envelope: "synthetic-operator-vault" });

test.describe("mixed operator and demo isolation", () => {
    test.skip(
        process.env.E2E_MIXED !== "1",
        "run through npm run test:e2e:mixed so the backend mounts the operator graph"
    );

    test("Live navigation is discoverable, keyboard accessible, and on demand", async ({
        browser,
    }) => {
        const context = await browser.newContext();
        await context.addInitScript(
            ({ session }) => {
                window.localStorage.setItem(
                    "sabha-operator-auth",
                    JSON.stringify(session)
                );
            },
            { session: OPERATOR_SESSION }
        );
        const page = await context.newPage();
        await page.goto("/meetings");

        const trigger = page.getByRole("button", {
            name: "Open Live navigation",
        });
        await expect(trigger).toBeVisible({ timeout: 30_000 });
        await expect(trigger).toContainText("Live");
        await expect(
            page.getByRole("link", { name: "Meeting space" })
        ).toHaveCount(0);

        await trigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: "Live" });
        await expect(dialog).toBeVisible();
        await expect(
            dialog.getByRole("link", { name: "Meeting space" })
        ).toBeVisible();
        await expect(
            dialog.getByRole("link", { name: "AI roster" })
        ).toBeVisible();
        await expect(
            dialog.getByRole("link", { name: "Knowledge stacks" })
        ).toBeVisible();
        await expect(
            dialog.getByRole("link", { name: "Settings" })
        ).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Sign out" })).toBeVisible();
        await expect(
            dialog.getByRole("link", { name: "Recorded demo" })
        ).toHaveCount(0);

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();

        await trigger.click();
        await page
            .getByRole("dialog", { name: "Live" })
            .getByRole("link", { name: "Settings" })
            .click();
        await expect(page).toHaveURL(/\/settings$/);
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeVisible();

        await trigger.click();
        await page
            .getByRole("dialog", { name: "Live" })
            .getByRole("link", { name: "Meeting space" })
            .click();
        await expect(page).toHaveURL(/\/meetings$/);
        await expect(trigger).toBeVisible();

        await trigger.click();
        await page
            .getByRole("dialog", { name: "Live" })
            .getByRole("button", { name: "Appearance: System" })
            .click();
        await page.getByRole("menuitemradio", { name: "Dark" }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await expect(dialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();

        await page.setViewportSize({ width: 320, height: 720 });
        await expect(trigger).toBeVisible();
        await trigger.click();
        await expect(dialog).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(320);

        await context.close();
    });

    test("a failed meeting list read is not presented as an empty space", async ({
        browser,
    }) => {
        const context = await browser.newContext();
        await context.addInitScript(
            ({ session }) => {
                window.localStorage.setItem(
                    "sabha-operator-auth",
                    JSON.stringify(session)
                );
            },
            { session: OPERATOR_SESSION }
        );
        const page = await context.newPage();
        let failReads = true;
        await page.route(/\/api\/meetings(\?|$)/, async (route) => {
            if (failReads) {
                await route.fulfill({
                    status: 503,
                    contentType: "application/json",
                    body: JSON.stringify({ detail: "Meeting list unavailable." }),
                });
                return;
            }
            await route.continue();
        });

        await page.goto("/meetings");
        await expect(
            page.getByRole("heading", { name: "Meeting space unavailable" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("No meeting rooms yet")).toHaveCount(0);

        failReads = false;
        await page.getByRole("button", { name: "Try again" }).click();
        await expect(
            page.getByRole("heading", { name: "Meeting space unavailable" })
        ).toBeHidden();

        await context.close();
    });

    test("demo edits and resets never touch the operator session or vault", async ({
        browser,
    }) => {
        const operatorContext = await browser.newContext();
        await operatorContext.addInitScript(
            ({ session, vault }) => {
                window.localStorage.setItem(
                    "sabha-operator-auth",
                    JSON.stringify(session)
                );
                window.localStorage.setItem("sabha-settings", vault);
            },
            { session: OPERATOR_SESSION, vault: VAULT_SENTINEL }
        );
        const operator = await operatorContext.newPage();
        await operator.goto("/settings");
        await expect(
            operator.getByRole("button", { name: "Open Live navigation" })
        ).toBeVisible({
            timeout: 30_000,
        });

        const beforeAuth = await operator.evaluate(() =>
            window.localStorage.getItem("sabha-operator-auth")
        );
        const beforeVault = await operator.evaluate(() =>
            window.localStorage.getItem("sabha-settings")
        );
        expect(beforeAuth).toBeTruthy();
        expect(beforeVault).toBe(VAULT_SENTINEL);

        const demoContext = await browser.newContext();
        await seedDemoIntroContext(demoContext);
        const demo = await demoContext.newPage();
        const network = guardNetwork(demo);
        await demo.goto("/demo");
        await demo.getByRole("link", { name: "Personas" }).click();
        await demo.getByRole("link", { name: "Mira" }).click();
        await demo.getByRole("tab", { name: "System Prompt" }).click();
        const prompt = demo.getByPlaceholder(
            "Define this persona's personality, expertise, and behavior..."
        );
        await prompt.fill("Mixed-mode practice marker.");
        await demo.getByRole("button", { name: "Save and activate new version" }).click();
        await expect(
            demo.getByText(/Saved and activated version 4\./)
        ).toBeVisible();

        // The operator remains signed in and its vault envelope is untouched.
        await expect(
            operator.getByRole("button", { name: "Open Live navigation" })
        ).toBeVisible();
        expect(
            await operator.evaluate(() =>
                window.localStorage.getItem("sabha-operator-auth")
            )
        ).toBe(beforeAuth);
        expect(
            await operator.evaluate(() =>
                window.localStorage.getItem("sabha-settings")
            )
        ).toBe(beforeVault);

        // Reset the demo; the operator page is still mounted and unchanged.
        await demo.getByRole("button", { name: "Reset demo" }).click();
        await demo
            .getByRole("button", { name: "Reset and discard changes" })
            .click();
        await expect(
            operator.getByRole("button", { name: "Open Live navigation" })
        ).toBeVisible();
        expect(
            await operator.evaluate(() =>
                window.localStorage.getItem("sabha-settings")
            )
        ).toBe(beforeVault);

        // A new demo edit survives the operator losing its local session.
        await demo.getByRole("link", { name: "Personas" }).click();
        await demo.getByRole("link", { name: "Mira" }).click();
        await demo.getByRole("tab", { name: "System Prompt" }).click();
        await demo
            .getByPlaceholder(
                "Define this persona's personality, expertise, and behavior..."
            )
            .fill("Mixed-mode survival marker.");
        await demo.getByRole("button", { name: "Save and activate new version" }).click();
        await expect(
            demo.getByText(/Saved and activated version 4\./)
        ).toBeVisible();

        await operator.evaluate(() =>
            window.localStorage.removeItem("sabha-operator-auth")
        );
        // Session loss/close must not unmount or clear the independent demo.
        await operatorContext.close();

        await demo.getByRole("link", { name: "Personas" }).click();
        await demo.getByRole("link", { name: "Mira" }).click();
        await demo.getByRole("tab", { name: "System Prompt" }).click();
        await expect(
            demo.getByPlaceholder(
                "Define this persona's personality, expertise, and behavior..."
            )
        ).toHaveValue("Mixed-mode survival marker.");

        network.assertClean();
        await expectNoPublicPersistence(demoContext, demo);

        await demoContext.close();
    });
});
