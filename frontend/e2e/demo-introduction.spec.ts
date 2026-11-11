import { expect, test } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
} from "./support/guardrails";

const IDEA = "One question. Different minds.";

async function gotoFirstLoad(page: import("@playwright/test").Page, path = "/demo") {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: IDEA })).toBeVisible({
        timeout: 30_000,
    });
}

test.describe("demo introduction", () => {
    test("scrolls through the four moments and preserves the destination", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await gotoFirstLoad(page);
        await expect(page.getByText("Should we proceed?", { exact: true })).toHaveCount(0);

        await expect(page.locator(".intro-progress")).toHaveAttribute(
            "data-progress",
            "0"
        );
        await expect(page.locator(".intro-rail")).toHaveCSS("opacity", "0.1");
        await expect(page.locator(".intro-card").first()).toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)"
        );
        await expect(
            page.getByRole("navigation", { name: "Demo workspace" })
        ).toHaveCount(0);
        await expect(page.getByTestId("tutorial-hud")).toHaveCount(0);
        await expect(page.locator('[data-testid="demo-introduction"] header')).toHaveCount(0);

        await page.mouse.move(720, 450);
        await page.mouse.wheel(0, 340);
        await page.mouse.wheel(0, 340);
        await expect(
            page.getByRole("heading", {
                name: "See where they disagree.",
            })
        ).toBeVisible();
        await expect(page.locator(".intro-progress")).toHaveAttribute(
            "data-progress",
            "1"
        );

        await page.keyboard.press("End");
        await expect(
            page.getByRole("heading", {
                name: "Clear facts. Different judgments.",
            })
        ).toBeVisible();
        await expect(page.locator(".intro-progress")).toHaveAttribute(
            "data-progress",
            "3"
        );

        await expect(page.locator(".intro-rail")).toHaveAttribute(
            "data-final",
            "true"
        );
        await expect(page.locator(".intro-rail")).toHaveCSS("opacity", "1");

        const skip = page.locator(".intro-control--skip");
        await expect(skip).toBeDisabled();
        await expect(skip).toHaveCSS("opacity", "0");

        const enter = page.getByRole("button", { name: "Enter the demo" });
        await expect(enter).toBeEnabled();
        await expect(enter).not.toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)"
        );
        await enter.click();

        await expect(
            page.getByRole("heading", { name: "Demo board" })
        ).toBeVisible();
        await expect(
            page.getByRole("navigation", { name: "Demo workspace" })
        ).toBeVisible();

        await page.reload();
        await expect(
            page.getByRole("heading", { name: "Demo board" })
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: IDEA })).toHaveCount(0);

        await page.getByRole("link", { name: "Personas" }).click();
        await expect(
            page.getByRole("heading", { name: "Personas", exact: true })
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: IDEA })).toHaveCount(0);

        await page.getByRole("link", { name: "Board", exact: true }).click();
        await page.getByRole("link", { name: "Start meeting" }).waitFor();
        await page.getByLabel("Explore demo").click();
        await page.getByRole("button", { name: "Restart demo" }).click();
        await expect(
            page.getByRole("heading", { name: "Demo board" })
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: IDEA })).toHaveCount(0);

        await page.getByRole("button", { name: "How this demo works" }).click();
        await expect(page.getByRole("heading", { name: IDEA })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(
            page.getByRole("button", { name: "How this demo works" })
        ).toBeFocused();

        await page.getByRole("button", { name: "Reset demo" }).click();
        await expect(page.getByRole("heading", { name: IDEA })).toHaveCount(0);
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
        await expect(page.getByRole("heading", { name: IDEA })).toBeVisible({
            timeout: 30_000,
        });
        await expect(page).toHaveURL(/\/demo\/settings$/);

        await page.getByRole("button", { name: "Skip introduction" }).click();
        await expect(
            page.getByRole("heading", { name: "Demo settings" })
        ).toBeVisible();
        await expect(page).toHaveURL(/\/demo\/settings$/);
    });

    test("reflows to the readable journey at 200 percent text size", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await gotoFirstLoad(page);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
        });

        await expect(page.locator("[data-intro-fallback]")).toBeVisible();
        await expect(page.getByRole("heading", { name: IDEA })).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Enter the demo" })
        ).toBeVisible();
    });

    test("falls back to the ordered journey when WebGL is unavailable", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            HTMLCanvasElement.prototype.getContext = function () {
                return null;
            } as typeof HTMLCanvasElement.prototype.getContext;
        });
        await gotoFirstLoad(page);

        await expect(page.locator("[data-intro-fallback]")).toBeVisible();
        await expect(page.getByRole("heading", { name: IDEA })).toBeVisible();
        await page.getByRole("button", { name: "Skip introduction" }).click();
        await expect(
            page.getByRole("heading", { name: "Demo board" })
        ).toBeVisible();
    });

    test("falls back when the WebGL context is lost", async ({ page }) => {
        await gotoFirstLoad(page);
        await page.locator(".intro-scene__canvas").dispatchEvent(
            "webglcontextlost"
        );

        await expect(page.locator("[data-intro-fallback]")).toBeVisible();
        await expect(page.getByRole("heading", { name: IDEA })).toBeVisible();
        await expect(
            page.getByRole("button", { name: "Skip introduction" })
        ).toBeVisible();
    });

    test("supports keyboard entry, mobile, zoom, and reduced motion", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await gotoFirstLoad(page);

        await expect(page.getByRole("heading", { name: IDEA })).toBeFocused();
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
