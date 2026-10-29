import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Production-build browser acceptance (spec-19).
 *
 * Builds the real frontend against the disposable replay backend, then runs
 * Playwright with `next start`. Extra arguments are forwarded to Playwright,
 * e.g. `npm run test:e2e:prod -- guided-journey.spec.ts`.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
    ...process.env,
    E2E_PRODUCTION: "1",
    NEXT_PUBLIC_API_URL: "http://127.0.0.1:8123/api",
};

function run(args) {
    const result = spawnSync(process.execPath, args, {
        cwd: root,
        env,
        stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["node_modules/next/dist/bin/next", "build"]);
run([
    "node_modules/@playwright/test/cli.js",
    "test",
    ...process.argv.slice(2),
]);
