"use client";

/**
 * A session read alone is not enough to expose the demo interface. The board
 * and room composition depend on the pinned package's safe config, so a failed
 * metadata read gets its own honest recovery state instead of an endless
 * board-level loading message.
 */
import type { ReactNode } from "react";
import {
    ReplayFrame,
    safeConfigFailureMessage,
    useReplaySession,
} from "@/features/meetings/runtime/replay-session";

export function ReplayMetadataGate({ children }: { children: ReactNode }) {
    const { safeConfigStatus, safeConfigError, retrySafeConfig } =
        useReplaySession();

    if (safeConfigStatus === "ready") {
        return <>{children}</>;
    }

    if (safeConfigStatus === "error") {
        return (
            <ReplayFrame title="Demo details unavailable">
                <p className="type-body text-ink-secondary">
                    {safeConfigFailureMessage(safeConfigError)}
                </p>
                <button
                    type="button"
                    onClick={retrySafeConfig}
                    className="m-control inline-flex min-h-10 items-center rounded-control border border-control bg-surface px-4 type-control text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                    Try again
                </button>
            </ReplayFrame>
        );
    }

    return (
        <ReplayFrame title="Loading demo details">
            <p className="type-body text-ink-muted">
                Fetching the recorded board and room setup for this package.
            </p>
        </ReplayFrame>
    );
}
