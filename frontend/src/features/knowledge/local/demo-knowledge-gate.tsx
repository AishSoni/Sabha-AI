"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useDemoWorkspace } from "@/features/demo-workspace";

/**
 * Keeps practice knowledge routes closed when the workspace cannot expand.
 * The recorded meeting and its evidence stay available from the board.
 */
export function DemoKnowledgeGate({ children }: { children: ReactNode }) {
    const workspace = useDemoWorkspace();

    if (workspace.status === "loading") {
        return (
            <main id="main-content" className="mx-auto max-w-5xl px-4 py-16 type-body text-ink-secondary" tabIndex={-1}>
                Loading the practice knowledge workspace…
            </main>
        );
    }

    if (workspace.status !== "ready") {
        return (
            <main id="main-content" className="mx-auto max-w-5xl px-4 py-16 text-ink" tabIndex={-1}>
                <h1 className="type-page-title">
                    Practice knowledge is unavailable
                </h1>
                <p className="mt-3 max-w-2xl type-body text-ink-secondary">
                    {workspace.error ??
                        "This recording has no practice knowledge workspace. The prepared Files view and the recorded journey are unchanged."}
                </p>
                <Link
                    href="/demo"
                    className="m-control mt-6 inline-flex min-h-10 items-center rounded-control border border-control bg-surface px-4 type-control text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                    Back to the prepared board
                </Link>
            </main>
        );
    }

    return <>{children}</>;
}

