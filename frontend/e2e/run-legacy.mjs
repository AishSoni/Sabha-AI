import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Version-5 compatibility acceptance (spec-27).
 *
 * Starts the disposable replay backend with the checked-in original package,
 * then runs the legacy browser journey. The normal `test:e2e` script remains
 * pinned to the expanded version-6 package.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
    ...process.env,
    E2E_LEGACY: "1",
    REPLAY_PACKAGE_DIR: resolve(
        root,
        "..",
        "backend",
        "tests",
        "fixtures",
        "replay",
        "hdfc-ine001a07rw5-v5"
    ),
};

const result = spawnSync(
    process.execPath,
    [
        "node_modules/@playwright/test/cli.js",
        "test",
        ...process.argv.slice(2),
    ],
    { cwd: root, env, stdio: "inherit" }
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
