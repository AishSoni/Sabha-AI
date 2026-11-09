import { test as base } from "@playwright/test";
import { seedDemoIntroContext } from "./demo-intro";

export { expect } from "@playwright/test";
export type {
    BrowserContext,
    Page,
    Request,
} from "@playwright/test";

/**
 * All ordinary demo journeys begin after the introduction is acknowledged.
 * A test that needs the first-load introduction imports `test` from
 * `@playwright/test` directly instead.
 */
export const test = base.extend<{ demoIntroSeeded: void }>({
    demoIntroSeeded: [
        async ({ context }, use) => {
            await seedDemoIntroContext(context);
            await use();
        },
        { auto: true },
    ],
});
