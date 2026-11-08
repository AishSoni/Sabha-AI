import { test, expect } from "@playwright/test";
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
        await expect(operator.getByText("Operator", { exact: true })).toBeVisible({
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
        const demo = await demoContext.newPage();
        const network = guardNetwork(demo);
        await demo.goto("/demo");
        await demo.getByRole("link", { name: "Personas" }).click();
        await demo.getByRole("link", { name: "The Credit Analyst" }).click();
        await demo.getByRole("tab", { name: "System Prompt" }).click();
        const prompt = demo.getByPlaceholder(
            "Define this persona's personality, expertise, and behavior..."
        );
        await prompt.fill("Mixed-mode practice marker.");
        await demo.getByRole("button", { name: "Save as New Version" }).click();
        await expect(
            demo.getByText(/Saved version 4 and made it active\./)
        ).toBeVisible();

        // The operator remains signed in and its vault envelope is untouched.
        await expect(operator.getByText("Operator", { exact: true })).toBeVisible();
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
        await expect(operator.getByText("Operator", { exact: true })).toBeVisible();
        expect(
            await operator.evaluate(() =>
                window.localStorage.getItem("sabha-settings")
            )
        ).toBe(beforeVault);

        // A new demo edit survives the operator losing its local session.
        await demo.getByRole("link", { name: "Personas" }).click();
        await demo.getByRole("link", { name: "The Credit Analyst" }).click();
        await demo.getByRole("tab", { name: "System Prompt" }).click();
        await demo
            .getByPlaceholder(
                "Define this persona's personality, expertise, and behavior..."
            )
            .fill("Mixed-mode survival marker.");
        await demo.getByRole("button", { name: "Save as New Version" }).click();
        await expect(
            demo.getByText(/Saved version 4 and made it active\./)
        ).toBeVisible();

        await operator.evaluate(() =>
            window.localStorage.removeItem("sabha-operator-auth")
        );
        // Session loss/close must not unmount or clear the independent demo.
        await operatorContext.close();

        await demo.getByRole("link", { name: "Personas" }).click();
        await demo.getByRole("link", { name: "The Credit Analyst" }).click();
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
