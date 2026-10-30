"use client";

export type AccessState =
    | "checking"
    | "signed-out"
    | "ready"
    | "forbidden"
    | "unavailable"
    | "unconfigured";

export function AccessStatusScreen({
    state,
    onRetry,
    onSignOut,
}: {
    state: AccessState;
    onRetry: () => void;
    onSignOut: () => void;
}) {
    const shell =
        "flex min-h-[60vh] items-center justify-center bg-neutral-950 px-4 text-neutral-100";

    if (state === "checking") {
        return (
            <main className={shell}>
                <p className="text-sm text-neutral-400">Checking operator access…</p>
            </main>
        );
    }

    if (state === "unconfigured") {
        return (
            <main className={shell}>
                <div className="max-w-md space-y-3 text-center">
                    <h1 className="text-lg font-semibold">Live workspace unavailable</h1>
                    <p className="text-sm text-neutral-400">
                        Operator sign-in is not configured for this deployment. The
                        guided replay remains available without an account.
                    </p>
                    <a
                        href="/demo"
                        className="inline-block rounded-md border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
                    >
                        Open guided replay
                    </a>
                </div>
            </main>
        );
    }

    if (state === "unavailable") {
        return (
            <main className={shell}>
                <div className="max-w-md space-y-3 text-center">
                    <h1 className="text-lg font-semibold">
                        Operator access is temporarily unavailable
                    </h1>
                    <p className="text-sm text-neutral-400">
                        The access service did not answer safely. Your session has not
                        been discarded; retry when the service recovers.
                    </p>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                    >
                        Retry
                    </button>
                </div>
            </main>
        );
    }

    if (state === "forbidden") {
        return (
            <main className={shell}>
                <div className="max-w-md space-y-3 text-center">
                    <h1 className="text-lg font-semibold">Operator access denied</h1>
                    <p className="text-sm text-neutral-400">
                        This account is valid but is not the operator for this Sabha
                        workspace.
                    </p>
                    <button
                        type="button"
                        onClick={onSignOut}
                        className="rounded-md border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
                    >
                        Sign out
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className={shell}>
            <div className="max-w-md space-y-3 text-center">
                <h1 className="text-lg font-semibold">Sign in required</h1>
                <p className="text-sm text-neutral-400">
                    The live workspace is private. Redirecting to the operator
                    sign-in…
                </p>
                <a
                    href="/login"
                    className="inline-block rounded-md border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
                >
                    Continue
                </a>
            </div>
        </main>
    );
}
