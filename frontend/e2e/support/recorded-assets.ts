import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

interface PackageAsset {
    asset_id: string;
    path: string;
    media_type: string;
    sha256: string;
}

export interface RecordedAssetHandler {
    packageRoot: string;
    assets: PackageAsset[];
}

/**
 * Serve the immutable package assets at their declared public origin. The
 * disposable backend publishes `MemoryStorage` URLs under example.invalid, so
 * the browser journey must provide those exact bytes without weakening the
 * network guard.
 */
export async function serveRecordedAssets(
    page: Page,
    packageRoot = join(
        process.cwd(),
        "..",
        "backend",
        "replay_packages",
        "hdfc-ine001a07rw5"
    )
): Promise<RecordedAssetHandler> {
    const assets = (
        JSON.parse(
            readFileSync(join(packageRoot, "assets", "index.json"), "utf8")
        ) as { assets: PackageAsset[] }
    ).assets;
    const bySha = new Map(assets.map((asset) => [asset.sha256, asset]));

    await page.route("https://example.invalid/replay-assets/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const fileName = pathname.split("/").pop() ?? "";
        const sha256 = fileName.split(".")[0] ?? "";
        const asset = bySha.get(sha256);
        if (!asset) {
            await route.fulfill({ status: 404, body: "unknown recorded asset" });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: asset.media_type,
            body: readFileSync(join(packageRoot, "assets", asset.path)),
        });
    });

    return { packageRoot, assets };
}
