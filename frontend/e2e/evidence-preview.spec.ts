import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * Focused evidence-preview journey for the approved HDFC replay.
 *
 * The recorded package is published by the disposable backend with a
 * `MemoryStorage` public URL, so the browser's only evidence bytes come from
 * the declared immutable asset origin. The spec proves that the Files
 * inventory and citation previews both use that origin and never touch live
 * document APIs.
 */

const PACKAGE_ROOT = join(
    process.cwd(),
    "..",
    "backend",
    "replay_packages",
    "hdfc-ine001a07rw5"
);

interface PackageAsset {
    asset_id: string;
    path: string;
    media_type: string;
    sha256: string;
}

const assets: PackageAsset[] = (
    JSON.parse(
        readFileSync(join(PACKAGE_ROOT, "assets", "index.json"), "utf8")
    ) as { assets: PackageAsset[] }
).assets;

const assetsBySha = new Map(assets.map((asset) => [asset.sha256, asset]));

async function serveRecordedAssets(page: Page) {
    await page.route("https://example.invalid/replay-assets/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const fileName = pathname.split("/").pop() ?? "";
        const sha256 = fileName.split(".")[0] ?? "";
        const asset = assetsBySha.get(sha256);
        if (!asset) {
            await route.fulfill({ status: 404, body: "unknown recorded asset" });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: asset.media_type,
            body: readFileSync(join(PACKAGE_ROOT, "assets", asset.path)),
        });
    });
}

async function openRecordedRoom(page: Page) {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/demo");

    const knowledge = page
        .locator("summary")
        .filter({ hasText: "Knowledge assignments" });
    await expect(knowledge).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
        await knowledge.nth(index).click();
    }
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/demo\/new$/);

    await page.getByRole("button", { name: "Create recorded meeting" }).click();
    await expect(page.getByText("Recorded intake ready")).toBeVisible();
    await expect(page.getByText(/Step 3 of 8/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/demo\/meetings\/[^/]+$/);
}

test.describe("recorded evidence previews", () => {
    test("lists all seven package files and previews a retained source", async ({
        page,
    }) => {
        await serveRecordedAssets(page);

        const externalRequests: string[] = [];
        const liveDocumentRequests: string[] = [];
        const liveMutations: string[] = [];
        page.on("request", (request) => {
            const url = request.url();
            if (
                url.startsWith("http") &&
                !url.startsWith("http://127.0.0.1:3100") &&
                !url.startsWith("http://127.0.0.1:8123")
            ) {
                externalRequests.push(url);
            }
            if (url.includes("/api/documents")) {
                liveDocumentRequests.push(url);
            }
            if (
                url.includes("/api/meetings") &&
                !url.includes("/api/replay") &&
                request.method() !== "GET"
            ) {
                liveMutations.push(`${request.method()} ${url}`);
            }
        });

        await openRecordedRoom(page);
        await page.getByRole("tab", { name: "Files" }).click();

        await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Retained source material" })
        ).toBeVisible();
        await expect(
            page.getByRole("heading", { name: "Prepared for this replay" })
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: "Demo-authored participant inputs",
            })
        ).toBeVisible();
        await expect(
            page.getByText("Demo-authored private input", { exact: true })
        ).toHaveCount(3);
        await expect(
            page.getByRole("button", { name: /^Preview evidence:/ })
        ).toHaveCount(7);
        await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

        const trigger = page.getByRole("button", {
            name: "Preview evidence: Crisil annexure",
        });
        await trigger.click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(
            dialog.getByRole("heading", { name: "Crisil annexure" })
        ).toBeVisible();
        await expect(
            dialog.getByLabel("Evidence provenance")
        ).toContainText("Retained source material");
        await expect(
            dialog.getByText("CRISIL rating rationale - retained excerpt")
        ).toBeVisible();
        await expect(dialog.getByText(/INE001A07RW5/).first()).toBeVisible();
        await expect(
            dialog.getByRole("link", { name: /Open original source/ })
        ).toHaveAttribute("href", /crisil\.com/);

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();

        expect(liveDocumentRequests).toEqual([]);
        expect(liveMutations).toEqual([]);
        expect(externalRequests.length).toBeGreaterThan(0);
        for (const url of externalRequests) {
            expect(url.startsWith("https://example.invalid/replay-assets/")).toBe(
                true
            );
        }
    });

    test("opens the exact recorded asset from a committed citation", async ({
        page,
    }) => {
        await serveRecordedAssets(page);
        await openRecordedRoom(page);

        await page.getByRole("button", { name: "Ask the Credit Analyst" }).click();
        await expect(
            page.getByText(/CRISIL's annexure row for ISIN INE001A07RW5/).first()
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Step 4 of 8/)).toBeVisible({
            timeout: 30_000,
        });
        await page.getByRole("button", { name: /5 Sources/ }).first().click();
        await expect(
            page.getByText(/CRISIL Rating Rationale/i).first()
        ).toBeVisible();

        const citationPreview = page
            .getByRole("button", { name: /^Preview evidence:/ })
            .first();
        await expect(citationPreview).toBeVisible();
        await citationPreview.click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(
            dialog.getByRole("heading", { name: "Crisil annexure" })
        ).toBeVisible();
        await expect(
            dialog.getByText(/S1 annexure row for ISIN INE001A07RW5/)
        ).toBeVisible();
        await expect(
            dialog.getByText(/Short transcription only/)
        ).toBeVisible();
        await expect(
            dialog.getByLabel("Evidence provenance")
        ).toContainText("Retained source material");

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
    });

    test("stays usable on a narrow screen with reduced motion and restores focus", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await serveRecordedAssets(page);
        await openRecordedRoom(page);

        await page.getByRole("tab", { name: "Files" }).click();
        const trigger = page.getByRole("button", {
            name: "Preview evidence: Shared fact sheet",
        });
        // The director footer overlays the bottom of the narrow scroll area;
        // activate by keyboard so this also proves keyboard reachability.
        await trigger.focus();
        await page.keyboard.press("Enter");

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(
            dialog.getByText("Read-only evidence preview. No changes can be made from this dialog.")
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();

        // Closing while the asset request is still in flight must cancel it
        // without surfacing a late error or a second dialog.
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(dialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
    });
});
