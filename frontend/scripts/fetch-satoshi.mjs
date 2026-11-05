#!/usr/bin/env node
/*
 * Fetches the official Satoshi variable font files from Fontshare.
 *
 * The ITF Free Font License permits self-hosting on our own infrastructure,
 * but it does not permit redistributing the font software through a
 * repository. The .woff2 files are therefore intentionally gitignored; this
 * script materialises the official files before `next dev` / `next build`.
 */
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontDir = join(root, "src", "app", "fonts");
const normal = join(fontDir, "Satoshi-Variable.woff2");
const italic = join(fontDir, "Satoshi-VariableItalic.woff2");
const license = join(fontDir, "FFL.txt");

if (existsSync(normal) && existsSync(italic)) {
  process.exit(0);
}

const url = "https://api.fontshare.com/v2/fonts/download/satoshi";
const work = await mkdtemp(join(tmpdir(), "sabha-satoshi-"));
const archive = join(work, "satoshi.zip");
const extracted = join(work, "extracted");

function extract() {
  mkdirSync(extracted, { recursive: true });
  try {
    execFileSync("unzip", ["-q", "-o", archive, "-d", extracted], {
      stdio: "ignore",
    });
    return;
  } catch {
    // Windows and macOS ship bsdtar, which reads ZIP archives. Linux CI
    // normally has unzip; tar is the fallback for minimal images.
  }
  execFileSync("tar", ["-xf", archive, "-C", extracted], { stdio: "inherit" });
}

try {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Fontshare returned ${response.status}`);
  }
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(archive);
    Readable.fromWeb(response.body).pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  extract();

  const base = join(extracted, "Satoshi_Complete");
  mkdirSync(fontDir, { recursive: true });
  await cp(
    join(base, "Fonts", "WEB", "fonts", "Satoshi-Variable.woff2"),
    normal,
  );
  await cp(
    join(base, "Fonts", "WEB", "fonts", "Satoshi-VariableItalic.woff2"),
    italic,
  );
  await cp(join(base, "License", "FFL.txt"), license);

  console.log("Fetched Satoshi variable fonts from Fontshare.");
} catch (error) {
  console.error(
    `Could not fetch the Satoshi fonts from Fontshare: ${error.message}\n` +
      "Run `npm run fonts:fetch` with network access, or place the official " +
      "Satoshi-Variable.woff2 and Satoshi-VariableItalic.woff2 files in " +
      "src/app/fonts/. The font files are not redistributed by this repository.",
  );
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
