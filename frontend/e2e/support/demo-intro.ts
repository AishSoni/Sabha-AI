import type { BrowserContext, Page } from "@playwright/test";
import {
    INTRO_STORAGE_KEY,
    INTRO_STORAGE_VALUE,
} from "../../src/features/demo-intro/steps";

/**
 * Journey specs start after the introduction has been acknowledged, matching
 * an ordinary reload in the same browser tab. The dedicated introduction spec
 * uses the base Playwright test so it can exercise the first-load path.
 */
export async function seedDemoIntro(page: Page): Promise<void> {
    await page.addInitScript(
        ({ key, value }) => {
            window.sessionStorage.setItem(key, value);
        },
        { key: INTRO_STORAGE_KEY, value: INTRO_STORAGE_VALUE }
    );
}

export async function seedDemoIntroContext(
    context: BrowserContext
): Promise<void> {
    await context.addInitScript(
        ({ key, value }) => {
            window.sessionStorage.setItem(key, value);
        },
        { key: INTRO_STORAGE_KEY, value: INTRO_STORAGE_VALUE }
    );
}
