import { test, expect, type Page } from "@playwright/test";
import {
    expectNoPublicPersistence,
    guardNetwork,
    storageSnapshot,
} from "./support/guardrails";

const DARK_CANVAS = "rgb(9, 13, 20)";
const LIGHT_CANVAS = "rgb(245, 247, 250)";

async function chooseAppearance(page: Page, option: "System" | "Light" | "Dark") {
    const trigger = page.getByRole("button", { name: /^Appearance:/ });
    await trigger.click();
    await page.getByRole("menuitemradio", { name: option }).click();
}

async function expectBody(page: Page, color: string) {
    await expect(page.locator("body")).toHaveCSS("background-color", color);
}

test.describe("appearance lifecycle", () => {
    test("system resolves on first paint and reload returns to system", async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: "dark" });
        await page.goto("/");

        await expect(page.locator("html")).not.toHaveAttribute("data-theme");
        await expectBody(page, DARK_CANVAS);
        expect(
            await page.evaluate(
                () => getComputedStyle(document.documentElement).colorScheme
            )
        ).toBe("dark");

        await chooseAppearance(page, "Light");
        await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
        await expectBody(page, LIGHT_CANVAS);
        expect(
            await page.evaluate(
                () => getComputedStyle(document.documentElement).colorScheme
            )
        ).toBe("light");

        await page.getByRole("link", { name: "Recorded demo" }).click();
        await expect(page).toHaveURL(/\/demo$/);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
        await expectBody(page, LIGHT_CANVAS);

        await page.reload();
        await expect(page.locator("html")).not.toHaveAttribute("data-theme");
        await expectBody(page, DARK_CANVAS);
        await expect(
            page.getByRole("button", { name: "Appearance: System" })
        ).toBeVisible();
    });

    test("toggling does not touch storage, network, the URL, or the tutorial", async ({
        page,
        context,
    }) => {
        const network = guardNetwork(page);
        await page.emulateMedia({ colorScheme: "light" });
        await page.goto("/demo");

        const hud = page.getByTestId("tutorial-hud");
        await expect(hud).toBeVisible();
        const instruction = await hud.textContent();
        const before = await storageSnapshot(context, page);

        const requests: string[] = [];
        page.on("request", (request) => {
            if (request.url().includes(":8123/api/")) {
                requests.push(request.url());
            }
        });

        await chooseAppearance(page, "Dark");
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await expectBody(page, DARK_CANVAS);
        await chooseAppearance(page, "Light");
        await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
        await chooseAppearance(page, "System");

        await expect(page.locator("html")).not.toHaveAttribute("data-theme");
        await expectBody(page, LIGHT_CANVAS);
        await expect(hud).toContainText(instruction ?? "");
        await expect(page).toHaveURL(/\/demo$/);
        expect(requests).toEqual([]);
        expect(await storageSnapshot(context, page)).toEqual(before);
        network.assertClean();
        await expectNoPublicPersistence(context, page);
    });

    test("keeps an in-progress practice edit while the appearance changes", async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: "dark" });
        await page.goto("/demo/roster/persona-credit/history");
        await expect(
            page.getByRole("heading", { name: "The Credit Analyst" })
        ).toBeVisible();

        const prompt = page.getByPlaceholder(
            "Define this persona's personality, expertise, and behavior..."
        );
        await prompt.fill("Appearance must not clear this draft.");
        await chooseAppearance(page, "Light");
        await expect(prompt).toHaveValue("Appearance must not clear this draft.");
        await expect(page).toHaveURL(/\/demo\/roster\/persona-credit\/history$/);
        await chooseAppearance(page, "Dark");
        await expect(prompt).toHaveValue("Appearance must not clear this draft.");
    });

    test("stays within 320 CSS pixels in both appearances", async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 844 });
        await page.emulateMedia({ colorScheme: "light" });
        await page.goto("/");

        const noOverflow = () =>
            page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1
            );

        expect(await noOverflow()).toBe(true);
        await chooseAppearance(page, "Dark");
        expect(await noOverflow()).toBe(true);
        await chooseAppearance(page, "Light");
        expect(await noOverflow()).toBe(true);
    });

    test("loads the self-hosted variable family at every UI weight", async ({
        page,
    }) => {
        await page.goto("/");

        const family = await page.evaluate(() => {
            const value = getComputedStyle(document.body).fontFamily;
            return value
                .split(",")[0]
                .trim()
                .replace(/^["']|["']$/g, "");
        });
        expect(family.toLowerCase()).not.toContain("inter");

        const loaded = await page.evaluate(async (fontFamily) => {
            const weights = ["400", "500", "600", "700"];
            const counts: Record<string, number> = {};
            for (const weight of weights) {
                const faces = await document.fonts.load(
                    `${weight} 16px "${fontFamily}"`
                );
                counts[weight] = faces.length;
            }
            const italic = await document.fonts.load(
                `italic 400 16px "${fontFamily}"`
            );
            counts.italic = italic.length;
            return counts;
        }, family);

        for (const [weight, count] of Object.entries(loaded)) {
            expect(count, `${weight} font faces`).toBeGreaterThan(0);
        }
    });

    test("reduced motion still switches the palette immediately", async ({
        page,
    }) => {
        await page.emulateMedia({
            colorScheme: "light",
            reducedMotion: "reduce",
        });
        await page.goto("/");
        await chooseAppearance(page, "Dark");
        await expectBody(page, DARK_CANVAS);
        await expect(
            page.getByRole("link", { name: "Start the demo" })
        ).toBeVisible();
    });
});
