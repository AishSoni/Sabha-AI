"use client";

/**
 * Runtime identity for coexisting product graphs (spec-14).
 *
 * A scope names the request graph a screen is composed against. Replay is not
 * a presentation flag: it has its own run identity and epoch, and every cache,
 * projection, observation, and abort boundary is keyed by it. The live scope
 * keeps a stable identity so navigating into and out of replay never mutates
 * live state.
 */
import { createContext, useContext, type ReactNode } from "react";

export type RuntimeKind = "live" | "replay";

export interface RuntimeIdentity {
    kind: RuntimeKind;
    /** Stable run/package identity; live uses a fixed id. */
    id: string;
    /** Replay restarts mint a new epoch; live stays at zero. */
    epoch: number;
}

export interface RuntimeScope {
    identity: RuntimeIdentity;
    label: string;
    provenance: Record<string, unknown>;
}

export const LIVE_RUNTIME_SCOPE: RuntimeScope = {
    identity: { kind: "live", id: "live", epoch: 0 },
    label: "Live meeting",
    provenance: { source: "live" },
};

const RuntimeScopeContext = createContext<RuntimeScope | null>(null);

export function RuntimeScopeProvider({
    scope,
    children,
}: {
    scope: RuntimeScope;
    children: ReactNode;
}) {
    return (
        <RuntimeScopeContext.Provider value={scope}>
            {children}
        </RuntimeScopeContext.Provider>
    );
}

export function useRuntimeScope(): RuntimeScope {
    const scope = useContext(RuntimeScopeContext);
    if (!scope) {
        throw new Error("Runtime scope is not configured for this screen.");
    }
    return scope;
}

/** Stable, serializable cache identity for one runtime epoch. */
export function runtimeScopeKey(scope: RuntimeScope): string {
    return JSON.stringify([
        scope.identity.kind,
        scope.identity.id,
        scope.identity.epoch,
    ]);
}

/**
 * Live records keep their historical cache identities. Replay projections and
 * query keys are prefixed so a colliding meeting/operation id can never merge
 * with the live scope even before two query clients are considered.
 */
export function projectionScopeId(scope: RuntimeScope): string {
    return scope.identity.kind === "live" ? "live" : runtimeScopeKey(scope);
}

/** Abort a scoped request when either the runtime or the caller aborts. */
export function combineSignals(
    runtime: AbortSignal | undefined,
    caller: AbortSignal | undefined
): AbortSignal | undefined {
    if (!runtime) return caller;
    if (!caller) return runtime;
    if (typeof AbortSignal.any === "function") {
        return AbortSignal.any([runtime, caller]);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (runtime.aborted || caller.aborted) {
        controller.abort();
    } else {
        runtime.addEventListener("abort", abort, { once: true });
        caller.addEventListener("abort", abort, { once: true });
    }
    return controller.signal;
}
