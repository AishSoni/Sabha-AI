"use client";

import Link from "next/link";
import { AppearanceControl } from "@/components/appearance";
import { PageContainer, PageHeader } from "@/components/shell";

export default function DemoSettingsPage() {
    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title="Settings in the public demo"
                description="Recorded demo settings, without operator credentials or provider connections."
                backHref="/demo"
                backLabel="Back to the board"
                meta={
                    <span className="type-meta font-semibold uppercase tracking-wide text-warning">
                        Recorded demo
                    </span>
                }
            />

            <PageContainer>
                <div className="space-y-6">
                    <section className="material-raised rounded-group border border-separator p-5">
                        <AppearanceControl />
                    </section>

                    <section className="material-raised rounded-group border border-separator p-5">
                        <h2 className="type-section-title text-ink">
                            Provider setup is operator-only
                        </h2>
                        <p className="mt-1 max-w-[68ch] type-body text-ink-secondary">
                            Model providers and credentials are managed only in
                            the authenticated operator workspace. This public
                            demo never asks for a key or opens a provider
                            connection.
                        </p>
                    </section>

                    <section className="material-raised rounded-group border border-separator p-5">
                        <h2 className="type-section-title text-ink">
                            Workspace lifetime
                        </h2>
                        <ul className="mt-2 list-disc space-y-2 pl-5 type-body text-ink-secondary">
                            <li>
                                Practice edits live in this browser tab and
                                disappear on refresh or{" "}
                                <strong>Reset demo</strong>.
                            </li>
                            <li>
                                <strong>Restart recording</strong> resets
                                playback only.
                            </li>
                            <li>
                                Recorded content is historical: information as
                                of 31 July 2020.
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
                            Start the recorded meeting
                        </Link>
                    </div>
                </div>
            </PageContainer>
        </main>
    );
}
