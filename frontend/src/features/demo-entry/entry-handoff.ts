import type { ReplayEntry } from "./replay-entry";

/**
 * In-memory handoff between the homepage departure and the demo entry.
 *
 * This is deliberately not sessionStorage/localStorage: a ready entry should
 * survive only the client-side navigation that just acquired it. A different
 * tab or a refresh correctly falls back to the composed direct-entry shell.
 */
const HANDOFF_KEY = Symbol.for("sabha.demo.entry.handoff.v1");
const HANDOFF_TTL_MS = 5 * 60_000;

interface HandoffHolder {
    entry: ReplayEntry | null;
}

function holder(): HandoffHolder {
    const globalRecord = globalThis as typeof globalThis & {
        [HANDOFF_KEY]?: HandoffHolder;
    };
    if (!globalRecord[HANDOFF_KEY]) {
        globalRecord[HANDOFF_KEY] = { entry: null };
    }
    return globalRecord[HANDOFF_KEY];
}

export function stageEntryHandoff(entry: ReplayEntry): void {
    holder().entry = entry;
}

export function peekEntryHandoff(now = Date.now()): ReplayEntry | null {
    const current = holder().entry;
    if (!current) return null;
    if (
        !current.requestId ||
        !Number.isFinite(current.createdAt) ||
        now - current.createdAt > HANDOFF_TTL_MS ||
        !current.session ||
        !current.safeConfig
    ) {
        holder().entry = null;
        return null;
    }
    return current;
}

export function clearEntryHandoff(): void {
    holder().entry = null;
}
