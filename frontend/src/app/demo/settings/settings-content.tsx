"use client";

import Link from "next/link";
import { useAnchorRef } from "@/features/demo-tutorial";

export function DemoSettingsContent() {
    const providersRef = useAnchorRef("settings.providers");
    const lifetimeRef = useAnchorRef("settings.lifetime");

    return (
        <main id="main-content" className="min-h-full px-4 py-10 text-ink" tabIndex={-1}>
            <div className="mx-auto max-w-3xl space-y-8">
                <header className="space-y-3">
                    <p className="type-meta font-semibold uppercase tracking-wide text-warning">
                        Demo workspace
                    </p>
                    <h1 className="type-page-title">
                        Demo settings
                    </h1>
                    <p className="type-body text-ink-secondary">
                        Settings for the public demo, without operator
                        credentials or provider connections.
                    </p>
                </header>

                <section
                    ref={providersRef}
                    className="space-y-3 rounded-group border border-separator bg-surface/40 p-5"
                >
                    <h2 className="type-section-title">
                        Provider setup is operator-only
                    </h2>
                    <p className="type-body text-ink-secondary">
                        Model providers and credentials are managed only in the
                        authenticated operator workspace. Provider setup,
                        connection tests, diagnostics and the browser key vault
                        are only available in live.
                    </p>
                </section>

                <section
                    ref={lifetimeRef}
                    className="space-y-3 rounded-group border border-separator bg-surface/40 p-5"
                >
                    <h2 className="type-section-title">
                        Workspace lifetime
                    </h2>
                    <ul className="list-disc space-y-2 pl-5 type-body text-ink-secondary">
                        <li>
                            Changes made in this browser tab disappear on refresh
                            or <strong>Reset demo</strong>.
                        </li>
                        <li>
                            <strong>Restart demo</strong> resets playback only.
                        </li>
                        <li>
                            Demo content is historical: information as of 31 July
                            2020.
                        </li>
                    </ul>
                </section>

                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/demo"
                        className="m-control inline-flex min-h-10 items-center rounded-control bg-action px-4 type-control font-medium text-action-foreground hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        Back to the board
                    </Link>
                    <Link
                        href="/demo/new"
                        className="m-control inline-flex min-h-10 items-center rounded-control border border-control bg-surface px-4 type-control text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        Open the demo
                    </Link>
                </div>
            </div>
        </main>
    );
}
