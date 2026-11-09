import { expect, test } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

async function gotoFirstLoad(page: import("@playwright/test").Page, path = "/demo") {
    await page.goto(path);
    await expect(
        page.getByRole("heading", {
            name: "One director. Three expert minds.",
        })
    ).toBeVisible({ timeout: 30_000 });
}

test.describe("demo introduction", () => {
    test("walks the four steps, preserves the destination, and does not repeat", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await gotoFirstLoad(page);

        await expect(page.getByText("Step 1 of 4")).toBeVisible();
        await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
        await expect(
            page.getByRole("navigation", { name: "Demo workspace" })
        ).toHaveCount(0);
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);

        await page.getByRole("button", { name: "Continue" }).click();
        await expect(
            page.getByRole("heading", {
                name: "Disagreement you can inspect.",
            })
        ).toBeVisible();
        await expect(page.getByText("Step 2 of 4")).toBeVisible();

        await page.getByRole("button", { name: "Back" }).click();
        await expect(
            page.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toBeVisible();

        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(
            page.getByRole("heading", { name: "A HDFC Bond Review Demo" })
        ).toBeVisible();
        await expect(page.getByText("Step 3 of 4")).toBeVisible();
        await expect(page.getByText("CRISIL AAA / Stable (July 2020)")).toBeVisible();

        await page.getByRole("button", { name: "Continue" }).click();
        await expect(
            page.getByRole("heading", { name: "What to try" })
        ).toBeVisible();
        await page.getByRole("button", { name: "Enter the demo" }).click();

        await expect(
            page.getByRole("heading", { name: "Demo board" })
        ).toBeVisible();
        await expect(
            page.getByRole("navigation", { name: "Demo workspace" })
        ).toBeVisible();

        // A reload in the same tab keeps the acknowledgement.
        await page.reload();
        await expect(
            page.getByRole("heading", { name: "Demo board" })
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toHaveCount(0);

        // Soft navigation and Restart demo do not repeat it either.
        await page.getByRole("link", { name: "Personas" }).click();
        await expect(
            page.getByRole("heading", { name: "Personas", exact: true })
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toHaveCount(0);

        await page.getByRole("link", { name: "Board", exact: true }).click();
        await page.getByRole("link", { name: "Start meeting" }).waitFor();
        await page.getByLabel("Explore demo").click();
        await page.getByRole("button", { name: "Restart demo" }).click();
        await expect(
            page.getByRole("heading", { name: "Demo board" })
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toHaveCount(0);

        // Deliberate revisit from the demo navigation.
        await page.getByRole("button", { name: "How this demo works" }).click();
        await expect(
            page.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(
            page.getByRole("button", { name: "How this demo works" })
        ).toBeFocused();

        // An immediate reset has no confirmation and leaves it dismissed.
        await page.getByRole("button", { name: "Reset demo" }).click();
        await expect(
            page.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toHaveCount(0);
        await expect(
            page.getByRole("heading", { name: "Demo board" })
        ).toBeVisible();

        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("a first-load deep link keeps its route through Skip", async ({
        page,
    }) => {
        await page.goto("/demo/settings");
        await expect(
            page.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page).toHaveURL(/\/demo\/settings$/);

        await page.getByRole("button", { name: "Skip introduction" }).click();
        await expect(
            page.getByRole("heading", { name: "Demo settings" })
        ).toBeVisible();
        await expect(page).toHaveURL(/\/demo\/settings$/);
    });

    test("supports keyboard entry, mobile, zoom, and reduced motion", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await gotoFirstLoad(page);

        await expect(
            page.getByRole("heading", {
                name: "One director. Three expert minds.",
            })
        ).toBeFocused();
        await page.getByRole("button", { name: "Skip introduction" }).focus();
        await page.keyboard.press("Enter");

        await expect(
            page.getByRole("heading", { name: "Demo board" })
        ).toBeVisible();
        await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
        });
        await expect(
            page.getByRole("link", { name: "Start meeting" })
        ).toBeVisible();
    });
});
