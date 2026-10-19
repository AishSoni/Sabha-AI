// Test runner setup for the whole frontend (src/test + tests/ trees).
// Moved here from src/test/setup.ts so the runner-owned tests/ directory
// hosts setup, not a source-tree folder (spec-03 harness layout).
//
// Registers Testing Library's Vitest matchers (Testing Library + vitest globals).
import "@testing-library/jest-dom/vitest";

// happy-dom does not ship a working Storage in this environment; zustand's
// persist middleware and vault tests need one. Minimal spec-shaped shim.
if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
    const backing = new Map<string, string>();
    const shim = {
        getItem: (key: string): string | null => (backing.has(key) ? backing.get(key)! : null),
        setItem: (key: string, value: string): void => void backing.set(key, value),
        removeItem: (key: string): void => void backing.delete(key),
        clear: (): void => void backing.clear(),
        key: (index: number): string | null => Array.from(backing.keys())[index] ?? null,
        get length(): number {
            return backing.size;
        },
    };
    Object.defineProperty(window, "localStorage", { value: shim, configurable: true });
    if (typeof (globalThis as { localStorage?: unknown }).localStorage === "undefined") {
        (globalThis as { localStorage?: unknown }).localStorage = shim;
    }
}
