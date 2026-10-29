import { defineConfig, devices } from '@playwright/test';

/**
 * Bounded browser slice for the recorded analyst journey (spec-17).
 *
 * The backend starter provisions a disposable local Postgres, publishes the
 * placeholder package, and runs the replay-only app. The Next dev server
 * targets that backend explicitly; no live Supabase or provider key is used.
 */
const BACKEND_PORT = 8123;
const FRONTEND_PORT = 3100;
// `npm run test:e2e:prod` builds first, then sets E2E_PRODUCTION so the same
// journeys run against `next start` rather than the dev server.
const PRODUCTION = process.env.E2E_PRODUCTION === "1";

export default defineConfig({
    testDir: './e2e',
    timeout: 90_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
        trace: 'retain-on-failure',
        ...devices['Desktop Chrome'],
    },
    webServer: [
        {
            command: 'node e2e/start-backend.mjs',
            url: `http://127.0.0.1:${BACKEND_PORT}/health`,
            reuseExistingServer: false,
            timeout: 180_000,
        },
        {
            command: PRODUCTION
                ? `npm run start -- -p ${FRONTEND_PORT}`
                : `npm run dev -- -p ${FRONTEND_PORT}`,
            url: `http://127.0.0.1:${FRONTEND_PORT}`,
            reuseExistingServer: false,
            timeout: PRODUCTION ? 240_000 : 180_000,
            env: {
                NEXT_PUBLIC_API_URL: `http://127.0.0.1:${BACKEND_PORT}/api`,
            },
        },
    ],
});
