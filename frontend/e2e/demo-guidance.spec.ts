import { test, expect } from "./support/demo-test";

const MEETING_ID = "a0000000-0000-4000-8000-000000000001";

test.describe("demo screen guidance", () => {
    test("each retained workspace screen has useful contextual copy", async ({
        page,
    }) => {
        const cases = [
            ["/demo", "Start the meeting", "The board shows who is in the room", false],
            ["/demo/new", "Create meeting", "This records the setup", false],
            [
                "/demo/meetings",
                "Active, ended, and archived records",
                "Archive after the closing vote keeps the record.",
                true,
            ],
            [
                `/demo/meetings/${MEETING_ID}`,
                "Choose who speaks next",
                null,
                false,
            ],
            [
                "/demo/roster",
                "Templates, not meeting participants",
                "Editing a persona changes future demo setups only",
                true,
            ],
            [
                "/demo/roster/persona-credit",
                "A persona's prompt is its standing instruction",
                "The recorded participant snapshot",
                true,
            ],
            [
                "/demo/roster/persona-credit/history",
                "Prompt history is versioned",
                "Viewing an earlier version is inspection",
                true,
            ],
            [
                "/demo/knowledge-stacks",
                "Shared evidence and private workspaces",
                "Shared stacks are visible to the room",
                true,
            ],
            [
                "/demo/knowledge-stacks/credit-private",
                "Documents stay within this stack's scope",
                "Removing a document revokes its eligibility",
                true,
            ],
            [
                "/demo/settings",
                "The demo is isolated by design",
                "Providers are operator-only in live",
                true,
            ],
        ] as const;

        for (const [path, instruction, detail, screenPrompt] of cases) {
            await page.goto(path);
            const hud = page.getByTestId("tutorial-hud");
            await expect(hud.getByText(instruction, { exact: true })).toBeVisible({
                timeout: 30_000,
            });
            if (detail) {
                await expect(hud.getByText(new RegExp(detail))).toBeVisible();
            }
            if (screenPrompt) {
                await expect(page.getByTestId("tutorial-progress")).toHaveCount(0);
            }
        }
    });
});
