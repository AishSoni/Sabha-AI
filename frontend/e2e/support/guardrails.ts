import { expect, type BrowserContext, type Page, type Request } from "@playwright/test";

const APP_ORIGIN = "http://127.0.0.1:3100";
const API_ORIGIN = "http://127.0.0.1:8123";
const ASSET_ORIGIN = "https://example.invalid";

const REPLAY_PATHS = [
    "/api/replay/session",
    "/api/replay/workspace-seed",
    "/api/replay/meetings",
];

function isReplayApi(pathname: string): boolean {
    return (
        REPLAY_PATHS.includes(pathname) ||
        pathname.startsWith("/api/replay/meetings/") ||
        pathname.startsWith("/api/replay/assets/")
    );
}

export interface NetworkGuard {
    requests: Request[];
    violations: string[];
    assertClean(): void;
}

/**
 * Capture every browser request and reject live API, Auth, provider, private
 * Storage, and arbitrary third-party traffic. App documents/static chunks are
 * allowed only from the local frontend; replay data is GET-only.
 */
export function guardNetwork(page: Page): NetworkGuard {
    const requests: Request[] = [];
    const violations: string[] = [];

    const record = (request: Request) => {
        requests.push(request);
        const url = request.url();
        const method = request.method();

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return;
        }

        if (url.startsWith(APP_ORIGIN)) {
            if (method !== "GET" && method !== "HEAD") {
                violations.push(`${method} ${url}`);
            }
            return;
        }

        if (url.startsWith(API_ORIGIN)) {
            const pathname = new URL(url).pathname;
            if (!isReplayApi(pathname)) {
                violations.push(`${method} ${url}`);
            }
            if (method !== "GET" && method !== "HEAD") {
                violations.push(`${method} ${url}`);
            }
            return;
        }

        if (url.startsWith(`${ASSET_ORIGIN}/replay-assets/`)) {
            if (method !== "GET") {
                violations.push(`${method} ${url}`);
            }
            return;
        }

        violations.push(`${method} ${url}`);
    };

    page.on("request", record);

    return {
        requests,
        violations,
        assertClean() {
            expect(violations).toEqual([]);
        },
    };
}

export interface StorageSnapshot {
    localStorage: string[];
    sessionStorage: string[];
    cookies: Array<{ name: string; value: string }>;
    indexedDb: string[];
    caches: string[];
    serviceWorkers: string[];
}

export async function storageSnapshot(
    context: BrowserContext,
    page: Page
): Promise<StorageSnapshot> {
    const snapshot = await page.evaluate(async () => {
        const factory = indexedDB as IDBFactory & {
            databases?: () => Promise<Array<{ name?: string }>>;
        };
        const databases = factory.databases
            ? await factory.databases()
            : [];
        const cacheNames =
            typeof caches === "undefined" ? [] : await caches.keys();
        const registrations =
            "serviceWorker" in navigator
                ? await navigator.serviceWorker.getRegistrations()
                : [];

        return {
            localStorage: Object.keys(window.localStorage),
            sessionStorage: Object.keys(window.sessionStorage),
            indexedDb: databases.map((database) => database.name ?? ""),
            caches: cacheNames,
            serviceWorkers: registrations.map((registration) => registration.scope),
        };
    });

    const cookies = await context.cookies();
    return {
        ...snapshot,
        cookies: cookies.map(({ name, value }) => ({ name, value })),
    };
}

/**
 * The public demo is deliberately tab-memory only. A fresh public context may
 * not leave workspace edits, cursors, drafts, samples, auth, or vault state in
 * any persistent browser store.
 */
export async function expectNoPublicPersistence(
    context: BrowserContext,
    page: Page
): Promise<void> {
    const snapshot = await storageSnapshot(context, page);
    expect(snapshot.localStorage, "localStorage").toEqual([]);
    expect(snapshot.sessionStorage, "sessionStorage").toEqual([]);
    expect(snapshot.cookies, "cookies").toEqual([]);
    expect(snapshot.indexedDb, "IndexedDB").toEqual([]);
    expect(snapshot.caches, "Cache Storage").toEqual([]);
    expect(snapshot.serviceWorkers, "service workers").toEqual([]);
}
