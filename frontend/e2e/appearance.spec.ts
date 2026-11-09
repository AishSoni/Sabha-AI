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
        await page.goto("/demo");

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
            page.getByRole("heading", { name: "Mira" })
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
        await page.goto("/demo");

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

    test("keeps chrome translucent over the dense atmosphere", async ({ page }) => {
        await page.goto("/demo");
        const field = page.getByTestId("atmosphere-field");
        await expect(field).toBeVisible();
        await expect(field.locator("circle")).toHaveCount(387);
        await expect(field.locator(".atmosphere-aurora")).toHaveCount(1);

        const chrome = await page.getByRole("banner").evaluate((element) => {
            const styles = getComputedStyle(element);
            return {
                background: styles.backgroundColor,
                backdrop: styles.backdropFilter,
                image: styles.backgroundImage,
                shadow: styles.boxShadow,
            };
        });
        expect(chrome.background).toMatch(
            /rgba\((255, 255, 255|17, 25, 37), 0\.(38|5)\)/
        );
        expect(chrome.backdrop).toContain("blur(10px)");
        expect(chrome.backdrop).toContain("saturate(1.35)");
        expect(chrome.image).toContain("linear-gradient");
        expect(chrome.shadow).toContain("inset");

        const tutorial = page.getByTestId("tutorial-hud");
        await expect(tutorial).toBeVisible();
        const panel = await tutorial.evaluate((element) => {
            const styles = getComputedStyle(element);
            const ring = getComputedStyle(element, "::after");
            return {
                background: styles.backgroundColor,
                backdrop: styles.backdropFilter,
                image: styles.backgroundImage,
                shadow: styles.boxShadow,
                ring: ring.backgroundImage,
            };
        });
        expect(panel.background).toMatch(
            /rgba\((255, 255, 255|17, 25, 37), 0\.(64|62)\)/
        );
        expect(panel.backdrop).toContain("blur(10px)");
        expect(panel.backdrop).toContain("saturate(1.3)");
        expect(panel.image).toContain("linear-gradient");
        expect(panel.shadow).toContain("inset");
        expect(panel.ring).toContain("linear-gradient");

        await page.goto("/demo/roster");
        await expect(field).toBeVisible();
        await expect(field.locator("circle")).toHaveCount(387);
    });

    test("uses the same tutorial surface in the card and the room", async ({
        page,
    }) => {
        const readSurface = (element: Element) => {
            const styles = getComputedStyle(element);
            return {
                background: styles.backgroundColor,
                image: styles.backgroundImage,
                backdrop: styles.backdropFilter,
                shadow: styles.boxShadow,
                radius: styles.borderRadius,
                border: styles.borderColor,
            };
        };

        await page.goto("/demo");
        const card = page.getByTestId("tutorial-hud");
        await expect(card).toBeVisible();
        await expect(card).toHaveAttribute("data-placement", "card");
        const cardSurface = await card.evaluate(readSurface);

        await page.goto(
            "/demo/meetings/a0000000-0000-4000-8000-000000000001"
        );
        await expect(
            page.getByRole("heading", {
                name: /A HDFC Bond Review Demo/,
            })
        ).toBeVisible({ timeout: 30_000 });

        const inline = page.getByTestId("tutorial-hud");
        await expect(inline).toBeVisible();
        await expect(inline).toHaveAttribute("data-placement", "inline");
        const inlineSurface = await inline.evaluate(readSurface);

        expect(inlineSurface).toEqual(cardSurface);
    });

    test("moves the starfield with pointer parallax", async ({ page }) => {
        await page.goto("/demo");
        const field = page.getByTestId("atmosphere-field");
        await expect(field).toBeVisible();

        await page.mouse.move(1100, 260);
        await expect
            .poll(() =>
                field.evaluate((element) =>
                    parseFloat(
                        element.style.getPropertyValue("--parallax-x") || "0"
                    )
                )
            )
            .toBeGreaterThan(8);

        const parallax = await field.evaluate((element) => ({
            x: parseFloat(element.style.getPropertyValue("--parallax-x") || "0"),
            y: parseFloat(element.style.getPropertyValue("--parallax-y") || "0"),
        }));
        expect(Math.abs(parallax.x)).toBeGreaterThan(8);
        expect(Math.abs(parallax.y)).toBeGreaterThan(1);
    });

    test("keeps the starfield visible and moving in the meeting room", async ({
        page,
    }) => {
        await page.goto(
            "/demo/meetings/a0000000-0000-4000-8000-000000000001"
        );
        await expect(
            page.getByRole("heading", {
                name: /A HDFC Bond Review Demo/,
            })
        ).toBeVisible({ timeout: 30_000 });

        const field = page.getByTestId("atmosphere-field");
        await expect(field).toBeVisible();
        await expect(field).toHaveCount(1);

        const drift = await field
            .locator(".atmosphere-drift-a")
            .evaluate((element) => {
                const styles = getComputedStyle(element);
                return {
                    name: styles.animationName,
                    duration: styles.animationDuration,
                    state: styles.animationPlayState,
                };
            });
        expect(drift.name).toContain("atmosphere-drift-a");
        expect(drift.duration).toBe("36s");
        expect(drift.state).toBe("running");

        const twinkle = await field
            .locator(".atmosphere-star")
            .first()
            .evaluate((element) => {
                const styles = getComputedStyle(element);
                return {
                    name: styles.animationName,
                    state: styles.animationPlayState,
                };
            });
        expect(twinkle.name).toContain("atmosphere-twinkle");
        expect(twinkle.state).toBe("running");

        const chatBackground = await page
            .getByTestId("room-chat-surface")
            .evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(chatBackground).not.toBe("rgba(0, 0, 0, 0)");
        expect(chatBackground).not.toBe("rgb(17, 25, 37)");
    });

    test("exposes theme choices without animation controls", async ({ page }) => {
        await page.goto("/demo");
        const field = page.getByTestId("atmosphere-field");
        await expect(field).toBeVisible();
        await expect(field).toHaveCSS("pointer-events", "none");
        await expect(field).toHaveAttribute("aria-hidden", "true");
        await expect(page.locator("html")).toHaveAttribute(
            "data-background",
            "on"
        );

        await page.getByRole("button", { name: /^Appearance:/ }).click();
        await expect(
            page.getByRole("menuitemradio", { name: "System" })
        ).toBeVisible();
        await expect(page.getByText("Background animation")).toHaveCount(0);
        await expect(
            page.getByRole("menuitemradio", { name: /^Paused$/ })
        ).toHaveCount(0);
        await expect(
            page.getByRole("menuitemradio", { name: /^On$/ })
        ).toHaveCount(0);
    });

    test("keyboard users can skip straight to main content", async ({ page }) => {
        await page.goto("/");
        await page.keyboard.press("Tab");

        const skip = page.getByRole("link", { name: "Skip to main content" });
        await expect(skip).toBeFocused();
        await expect(skip).toBeVisible();
        await skip.press("Enter");

        await expect(page).toHaveURL(/#main-content$/);
        await expect(page.locator("#main-content")).toBeFocused();
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
        await page.goto("/demo");
        await expect(page.locator("html")).toHaveAttribute(
            "data-background",
            "paused"
        );
        await chooseAppearance(page, "Dark");
        await expectBody(page, DARK_CANVAS);
        await expect(page.getByRole("banner")).toBeVisible();
    });

    test("uses the same participant marks on the roster and in the room", async ({
        page,
    }) => {
        await page.goto("/demo/roster");
        const rosterMarks = page.locator("[data-participant-mark]");
        await expect(rosterMarks).toHaveCount(3);
        const roster = await rosterMarks.evaluateAll((marks) =>
            marks.map((mark) => mark.getAttribute("data-participant-mark"))
        );

        await page.goto(
            "/demo/meetings/a0000000-0000-4000-8000-000000000001"
        );
        await expect(
            page.getByRole("heading", {
                name: /A HDFC Bond Review Demo/,
            })
        ).toBeVisible();
        const roomMarks = page.locator("[data-participant-mark]");
        await expect(roomMarks).toHaveCount(4);
        const room = await roomMarks.evaluateAll((marks) =>
            marks.map((mark) => mark.getAttribute("data-participant-mark"))
        );

        expect(roster).toEqual(["burst", "nova", "orbit"]);
        expect(room.slice(0, roster.length)).toEqual(roster);
    });
});
