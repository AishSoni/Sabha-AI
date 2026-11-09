import { expect, test } from "@playwright/test";

import { guardNetwork, storageSnapshot } from "./support/guardrails";

test.describe("homepage composition", () => {
  test("renders the four approved regions and exact invitation", async ({
    page,
  }) => {
    const network = guardNetwork(page);
    await page.goto("/");

    await expect(page.locator(".home-page > .home-chrome")).toHaveCount(1);
    await expect(page.locator("header")).toHaveCount(0);
    await expect(page.locator(".home-page > main > section")).toHaveCount(2);
    await expect(page.locator(".home-page > footer")).toHaveCount(1);

    const brand = page.locator(".home-chrome__brand");
    await expect(brand).toHaveAttribute("href", "/");
    await expect(brand.locator(".sabha-logo__wordmark")).toHaveText("Sabha AI");
    await expect(brand.locator(".sabha-logo__mark")).toBeVisible();
    await expect(
      page.locator(".home-footer__brand .sabha-logo__wordmark"),
    ).toHaveText("Sabha AI");
    await expect(
      page.locator('link[rel="icon"][href*="icon.svg"]'),
    ).toHaveCount(1);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Bring more minds to your next decision.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Distinct AI perspectives, grounded in sources you can inspect, with you setting the direction.",
      ),
    ).toHaveCount(0);
    await expect(
      page.getByText("Prepared demo · recorded responses, not live generation."),
    ).toHaveCount(0);
    const map = page.locator(".home-graph__map");
    await expect(map).toBeVisible();
    const mapWidth = await map.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(Math.abs(mapWidth - viewportWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator(".home-graph__overlay")).toHaveCount(0);
    await expect(page.locator(".home-graph__detail")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Appearance:/ }),
    ).toHaveCount(0);
    await expect(page.getByTestId("home-motion-toggle")).toHaveCount(0);

    const demo = page
      .locator(".home-hero")
      .getByRole("link", { name: "Try the demo" });
    await expect(demo).toHaveAttribute("href", "/demo");
    await expect(demo.locator(".home-demo-cta__badge")).toHaveCount(1);
    await expect(
      demo.locator(".home-demo-cta__badge .sabha-mark__dark"),
    ).toBeVisible();
    const operator = page
      .locator(".home-hero")
      .getByRole("link", { name: "Operator sign-in" });
    await expect(operator).toHaveAttribute("href", "/login");
    await expect
      .poll(() =>
        operator.evaluate((element) => getComputedStyle(element).borderRadius),
      )
      .toBe("999px");
    await expect(
      page.getByRole("link", { name: "Explore the evidence constellation" }),
    ).toHaveAttribute("href", "#evidence");

    await expect(
      page.getByRole("heading", {
        name: "Different perspectives. Traceable sources.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Illustrative view of the demo · not a live retrieval record",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Inspect evidence in the demo" }),
    ).toHaveAttribute("href", "/demo");
    await expect(page.getByText("Director")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Explore the demo" }).last(),
    ).toHaveAttribute("href", "/demo");

    network.assertClean();
  });

  test("keeps the homepage free of appearance and motion controls", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: /^Appearance:/ }),
    ).toHaveCount(0);
    await expect(page.getByTestId("home-motion-toggle")).toHaveCount(0);
    await expect(page.locator(".home-chrome__appearance")).toHaveCount(0);
    await expect(page.locator(".home-chrome__pause")).toHaveCount(0);
    await expect(page.locator(".home-graph__detail")).toHaveCount(0);
  });
  test("rotates the decorative tail phrase", async ({ page }) => {
    await page.goto("/");
    const phrase = page.locator(".home-headline__tail-text");
    await expect(phrase).toContainText("to your next decision.");

    await page.waitForTimeout(7400);
    await expect(phrase).toContainText("before the next call.");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Bring more minds to your next decision.",
      }),
    ).toBeVisible();
  });

  test("keeps the hero invitation visible at compact and wide sizes", async ({
    page,
  }) => {
    await page.goto("/");

    for (const viewport of [
      { width: 320, height: 800 },
      { width: 390, height: 844 },
      { width: 768, height: 900 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => {
        const operator = document
          .querySelector(".home-operator-link")
          ?.getBoundingClientRect();
        const cta = document
          .querySelector(".home-demo-cta")
          ?.getBoundingClientRect();
        const slots = document.querySelectorAll(
          ".home-persona-field__static .home-slot",
        );
        const visibleSlots = Array.from(slots).filter(
          (slot) => getComputedStyle(slot).display !== "none",
        ).length;
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          operatorBottom: operator?.bottom ?? Infinity,
          ctaWidth: cta?.width ?? 0,
          visibleSlots,
        };
      });

      expect(geometry.scrollWidth, `${viewport.width}px overflow`).toBeLessThanOrEqual(
        geometry.viewportWidth,
      );
      expect(geometry.operatorBottom, `${viewport.width}px operator`).toBeLessThanOrEqual(
        geometry.viewportHeight,
      );
      expect(geometry.ctaWidth, `${viewport.width}px CTA`).toBeGreaterThanOrEqual(
        viewport.width <= 320 ? 288 : 320,
      );
      expect(geometry.visibleSlots, `${viewport.width}px slots`).toBe(189);
    }
  });

  test("does not introduce public persistence or third-party requests", async ({
    page,
    context,
  }) => {
    const network = guardNetwork(page);
    await page.goto("/");
    const before = await storageSnapshot(context, page);

    await page
      .getByRole("link", { name: "Explore the evidence constellation" })
      .click();
    await expect(page).toHaveURL(/#evidence$/);

    const after = await storageSnapshot(context, page);
    expect(after.localStorage).toEqual(before.localStorage);
    expect(after.sessionStorage).toEqual(before.sessionStorage);
    expect(after.indexedDb).toEqual(before.indexedDb);
    expect(after.caches).toEqual(before.caches);
    expect(after.serviceWorkers).toEqual(before.serviceWorkers);
    network.assertClean();
  });

});

test.describe("homepage constellation brand", () => {
  test("swaps the mark with the resolved appearance", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    const brand = page.locator(".home-chrome__brand");
    await expect(brand.locator(".sabha-mark__dark")).toBeVisible();
    await expect(brand.locator(".sabha-mark__light")).toBeHidden();
    await expect
      .poll(() =>
        page
          .locator(".home-page")
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe("rgb(7, 4, 15)");

    await page.emulateMedia({ colorScheme: "light" });

    await expect(brand.locator(".sabha-mark__light")).toBeVisible();
    await expect(brand.locator(".sabha-mark__dark")).toBeHidden();
    await expect
      .poll(() =>
        page
          .locator(".home-page")
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe("rgb(246, 241, 248)");
  });
});

test.describe("homepage lifecycle", () => {
  test("stops ambient work when the field leaves the viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const field = page.getByTestId("home-persona-field");
    await expect(field).toHaveAttribute("data-activity", "running");

    await page.locator("#evidence").scrollIntoViewIfNeeded();
    await expect(field).toHaveAttribute("data-activity", "offscreen");

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(field).toHaveAttribute("data-activity", "running");
  });

  test("stops ambient work while the document is hidden", async ({ page }) => {
    await page.goto("/");

    const field = page.getByTestId("home-persona-field");
    await expect(field).toHaveAttribute("data-activity", "running");

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(field).toHaveAttribute("data-activity", "hidden");

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(field).toHaveAttribute("data-activity", "running");
  });
});

test.describe("homepage fallback", () => {
  test("keeps the static constellation when WebGL2 is unavailable", async ({
    page,
  }) => {
    await page.addInitScript(`
      (() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (type === "webgl2") return null;
          return original.call(this, type, ...args);
        };
      })();
    `);
    await page.goto("/");

    const field = page.getByTestId("home-persona-field");
    await expect(field).toHaveAttribute("data-webgl", "failed");
    await expect(field).toHaveAttribute("data-activity", "fallback");
    await expect(page.getByTestId("home-persona-canvas")).toHaveCSS(
      "opacity",
      "0",
    );
    await expect(page.getByTestId("home-persona-static")).toBeVisible();
    await expect(
      page
        .locator(".home-hero")
        .getByRole("link", { name: "Try the demo" }),
    ).toHaveAttribute("href", "/demo");
  });

  test("keeps the invitation usable when the webfont fails", async ({
    page,
  }) => {
    await page.route("**/*.woff2", (route) => route.abort());
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Bring more minds to your next decision.",
      }),
    ).toBeVisible();
    await expect(
      page
        .locator(".home-hero")
        .getByRole("link", { name: "Try the demo" }),
    ).toBeVisible();
    await expect(page.locator(".home-chrome__brand .sabha-logo")).toBeVisible();
  });
});

test.describe("homepage evidence graph", () => {
  test("selects a node without moving the authored graph", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#evidence");

    const credit = page
      .locator(".home-graph__map .home-graph__node")
      .filter({ hasText: "Mira" });
    const crisil = page
      .locator(".home-graph__map .home-graph__node")
      .filter({ hasText: "Crisil annexure" });
    const before = await credit.boundingBox();

    await crisil.focus();
    await crisil.press("Enter");

    await expect(
      page.locator(".home-graph__overlay h3"),
    ).toHaveText("Crisil annexure");
    await expect(
      page.locator(".home-graph__overlay").getByText("Cited source"),
    ).toBeVisible();
    await expect(
      page.locator(".home-graph__map .home-graph__edge[data-active='true']"),
    ).toHaveCount(1);
    await expect(crisil).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator(".home-graph__map .home-graph__node[aria-pressed='true']"),
    ).toHaveCount(1);

    const after = await credit.boundingBox();
    expect(after?.x).toBe(before?.x);
    expect(after?.y).toBe(before?.y);
  });

  test("reveals glass details on hover and pins them on click", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#evidence");

    const overlay = page.locator(".home-graph__overlay");
    await expect(overlay).toHaveCount(0);

    const credit = page
      .locator(".home-graph__map .home-graph__node")
      .filter({ hasText: "Mira" });
    await credit.hover();
    await expect(overlay).toBeVisible();
    await expect(overlay.locator("h3")).toHaveText("Mira");
    await expect(overlay).toHaveAttribute("data-pinned", "false");
    await expect
      .poll(() =>
        overlay.evaluate((element) => getComputedStyle(element).backdropFilter),
      )
      .toContain("blur");

    await page.mouse.move(4, 4);
    await expect(overlay).toHaveCount(0);

    await credit.click();
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute("data-pinned", "true");
    await page.mouse.move(4, 4);
    await expect(overlay).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);
  });

  test("offers a complete relationship list on request", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#evidence");

    const crisil = page
      .locator(".home-graph__map .home-graph__node")
      .filter({ hasText: "Crisil annexure" });
    await crisil.focus();
    await crisil.press("Enter");

    const reading = page.locator(".home-graph__overlay .home-graph__reading");
    await reading.locator("summary").click();
    await expect(reading).toHaveAttribute("open", "");
    await expect(
      reading.getByText("Mira → Crisil annexure"),
    ).toBeVisible();
    await expect(reading.getByText("Assigned / available").first()).toBeVisible();
    await expect(reading.getByText("Example citation").first()).toBeVisible();
  });

  test("uses the structured list on compact screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#evidence");

    await expect(page.locator(".home-graph__map")).toBeHidden();
    const mobile = page.locator(".home-graph__mobile");
    await expect(mobile).toBeVisible();
    await mobile
      .locator(".home-graph__node-list-button")
      .filter({ hasText: "Portfolio mandate" })
      .click();
    await expect(
      page.locator(".home-graph__overlay h3"),
    ).toHaveText("Portfolio mandate");
  });
});

test.describe("homepage reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("keeps a static, readable composition without motion controls", async ({
    page,
  }) => {
    await page.goto("/");

    const field = page.getByTestId("home-persona-field");
    await expect(field).toHaveAttribute("data-motion", "reduced");
    await expect(field).toHaveAttribute("data-activity", "reduced");
    await expect(field).toHaveAttribute("data-webgl", "static");
    await expect(page.getByTestId("home-persona-canvas")).toHaveCSS(
      "opacity",
      "0",
    );

    await expect(page.getByTestId("home-motion-toggle")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page
        .locator(".home-hero")
        .getByRole("link", { name: "Try the demo" }),
    ).toBeVisible();

    const phrase = page.locator(".home-headline__tail-text");
    await expect(phrase).toContainText("to your next decision.");
    await page.waitForTimeout(7400);
    await expect(phrase).toContainText("to your next decision.");
  });
});

test.describe("homepage without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("serves a usable static invitation and real links", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Bring more minds to your next decision.",
      }),
    ).toBeVisible();
    await expect(
      page
        .locator(".home-hero")
        .getByRole("link", { name: "Try the demo" }),
    ).toHaveAttribute("href", "/demo");
    await expect(
      page.getByText("Prepared demo · recorded responses, not live generation."),
    ).toHaveCount(0);
    await expect(
      page.locator(".home-chrome__brand .sabha-logo__wordmark"),
    ).toHaveText("Sabha AI");
    await expect(page.getByTestId("home-persona-static")).toBeVisible();
    await expect(page.locator(".home-graph__map")).toBeVisible();
    await expect(page.locator(".home-graph__overlay")).toHaveCount(0);
    await expect(
      page.locator(".home-graph__node-name").first(),
    ).toBeVisible();
  });
});
