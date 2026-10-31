import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Mixed operator/demo acceptance (spec-27 journey E).
 *
 * The disposable backend mounts the live graph with a synthetic operator
 * verifier beside the recorded replay package. The browser uses a synthetic
 * local Auth session; no live Supabase, provider, or vault is contacted.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
    ...process.env,
    E2E_MIXED: "1",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-anon-key",
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
