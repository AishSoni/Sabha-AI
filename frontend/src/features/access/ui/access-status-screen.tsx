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
        "flex min-h-[60vh] items-center justify-center bg-canvas px-4 text-ink";

    if (state === "checking") {
        return (
            <main className={shell}>
                <p className="type-body text-ink-secondary">Checking operator access…</p>
            </main>
        );
    }

    if (state === "unconfigured") {
        return (
            <main className={shell}>
                <div className="max-w-md space-y-3 text-center">
                    <h1 className="type-item-title">Live workspace unavailable</h1>
                    <p className="type-body text-ink-secondary">
                        Operator sign-in is not configured for this deployment. The
                        guided replay remains available without an account.
                    </p>
                    <a
                        href="/demo"
                        className="m-control inline-flex min-h-10 items-center rounded-control border border-control bg-surface px-4 type-control text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
                    <h1 className="type-item-title">
                        Operator access is temporarily unavailable
                    </h1>
                    <p className="type-body text-ink-secondary">
                        The access service did not answer safely. Your session has not
                        been discarded; retry when the service recovers.
                    </p>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="m-control inline-flex min-h-10 items-center rounded-control bg-action px-4 type-control font-medium text-action-foreground hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
                    <h1 className="type-item-title">Operator access denied</h1>
                    <p className="type-body text-ink-secondary">
                        This account is valid but is not the operator for this Sabha
                        workspace.
                    </p>
                    <button
                        type="button"
                        onClick={onSignOut}
                        className="m-control inline-flex min-h-10 items-center rounded-control border border-control bg-surface px-4 type-control text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
                <h1 className="type-item-title">Sign in required</h1>
                <p className="type-body text-ink-secondary">
                    The live workspace is private. Redirecting to the operator
                    sign-in…
                </p>
                <a
                    href="/login"
                    className="m-control inline-flex min-h-10 items-center rounded-control border border-control bg-surface px-4 type-control text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                    Continue
                </a>
            </div>
        </main>
    );
}
