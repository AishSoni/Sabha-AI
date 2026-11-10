"use client";

import {
    replayEntryFailureMessage,
    type DemoEntryReadiness,
} from "@/features/demo-entry";

/**
 * Direct-entry waiting and recovery shell.
 *
 * A refresh, new tab, or deep link cannot use the homepage handoff. This shell
 * keeps the destination route mounted while the same two reads complete. It is
 * a composed full-screen surface, not one of the old loading cards.
 */
export function DemoEntryShell({
    readiness,
}: {
    readiness: DemoEntryReadiness;
}) {
    const failed =
        readiness.sessionStatus === "error" ||
        readiness.safeConfigStatus === "error";
    const message = readiness.sessionError
        ? replayEntryFailureMessage("session", readiness.sessionError)
        : readiness.safeConfigError
          ? replayEntryFailureMessage("metadata", readiness.safeConfigError)
          : "The demo and its meeting details are loading.";

    return (
        <div className="intro-entry" data-testid="demo-entry-shell">
            <div className="intro-entry__atmosphere" aria-hidden="true" />
            <main
                id="main-content"
                className="intro-entry__main"
                tabIndex={-1}
                aria-busy={!failed}
            >
                <h1 className="sr-only">
                    {failed ? "The demo could not open." : "Preparing the demo."}
                </h1>
                <p
                    className="intro-entry__status"
                    role={failed ? "alert" : "status"}
                >
                    {failed
                        ? message
                        : "Preparing the demo."}
                </p>
                {failed ? (
                    <button
                        type="button"
                        className="intro-entry__retry"
                        onClick={readiness.retryEntry}
                    >
                        Try again
                    </button>
                ) : null}
            </main>
        </div>
    );
}
