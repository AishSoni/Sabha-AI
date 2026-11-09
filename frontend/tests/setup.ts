// Test runner setup for the whole frontend (src/test + tests/ trees).
// Moved here from src/test/setup.ts so the runner-owned tests/ directory
// hosts setup, not a source-tree folder (spec-03 harness layout).
//
// Registers Testing Library's Vitest matchers (Testing Library + vitest globals).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";

import {
    beginAccess,
    endAccess,
    setLiveAccessTokenSource,
} from "@/shared/access";

// Every frontend test starts in an admitted operator epoch with a synthetic
// token source. Tests that exercise sign-out/session loss end it explicitly.
beforeEach(() => {
    setLiveAccessTokenSource(async () => "test-operator-token");
    beginAccess();
    // The demo introduction is tab-scoped. Tests that want first-load behavior
    // start unacknowledged; journey tests seed the key explicitly.
    window.sessionStorage?.clear();
});

afterEach(() => {
    endAccess("signed_out");
    setLiveAccessTokenSource(null);
});

// happy-dom does not ship a working Storage in this environment; zustand's
// persist middleware and vault tests need one. Minimal spec-shaped shim.
if (typeof window !== "undefined") {
    const storageShim = () => {
        const backing = new Map<string, string>();
        return {
            getItem: (key: string): string | null =>
                backing.has(key) ? backing.get(key)! : null,
            setItem: (key: string, value: string): void =>
                void backing.set(key, value),
            removeItem: (key: string): void => void backing.delete(key),
            clear: (): void => void backing.clear(),
            key: (index: number): string | null =>
                Array.from(backing.keys())[index] ?? null,
            get length(): number {
                return backing.size;
            },
        };
    };

    if (typeof window.localStorage === "undefined") {
        const localStorage = storageShim();
        Object.defineProperty(window, "localStorage", {
            value: localStorage,
            configurable: true,
        });
        if (
            typeof (globalThis as { localStorage?: unknown }).localStorage ===
            "undefined"
        ) {
            (globalThis as { localStorage?: unknown }).localStorage =
                localStorage;
        }
    }

    if (typeof window.sessionStorage === "undefined") {
        const sessionStorage = storageShim();
        Object.defineProperty(window, "sessionStorage", {
            value: sessionStorage,
            configurable: true,
        });
        if (
            typeof (globalThis as { sessionStorage?: unknown }).sessionStorage ===
            "undefined"
        ) {
            (globalThis as { sessionStorage?: unknown }).sessionStorage =
                sessionStorage;
        }
    }
}
