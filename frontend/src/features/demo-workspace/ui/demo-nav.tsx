"use client";

/**
 * Persistent demo chrome (spec-23, spec-33).
 *
 * The nav is the only place that advertises workspace destinations, so a
 * feature is linked here only once its demo adapter exists. Practice state is
 * browser memory; the recorded-demo scope and reset copy keep that visible.
 */
import { useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import { useAnchorRef } from "@/features/demo-tutorial";
import { AppearanceMenu } from "@/components/appearance";
import { AppShell, type AppNavItem } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useDemoWorkspace } from "../provider";

export function DemoNav({
    children,
    hideChrome = false,
}: {
    children: ReactNode;
    hideChrome?: boolean;
}) {
    const workspace = useDemoWorkspace();
    const personasRef = useAnchorRef("nav.personas");
    const knowledgeRef = useAnchorRef("nav.knowledge");
    const [confirmingReset, setConfirmingReset] = useState(false);
    const [announcement, setAnnouncement] = useState("");

    const destinations: readonly AppNavItem[] = [
        { href: "/demo", label: "Board", exact: true },
        { href: "/demo/new", label: "New meeting", exact: true },
        { href: "/demo/meetings", label: "Meetings" },
        {
            href: "/demo/roster",
            label: "Personas",
            registerNode: personasRef,
        },
        {
            href: "/demo/knowledge-stacks",
            label: "Knowledge",
            registerNode: knowledgeRef,
        },
        { href: "/demo/settings", label: "Settings", exact: true },
    ];

    const requestReset = () => {
        if (workspace.hasPracticeEdits) {
            setConfirmingReset(true);
            return;
        }
        workspace.resetWorkspace();
        setAnnouncement("Demo workspace reset to the approved seed.");
    };

    const confirmReset = () => {
        workspace.resetWorkspace();
        setConfirmingReset(false);
        setAnnouncement("Demo workspace reset to the approved seed.");
    };

    return (
        <AppShell
            homeHref="/demo"
            runtimeLabel="Recorded demo"
            navLabel="Demo workspace"
            items={destinations}
            hideChrome={hideChrome}
            actions={
                <>
                    <AppearanceMenu />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label="Reset demo"
                        onClick={requestReset}
                    >
                        <RotateCcw aria-hidden="true" />
                        <span className="hidden sm:inline">Reset demo</span>
                    </Button>
                </>
            }
            banner={
                <>
                    {confirmingReset ? (
                        <div
                            role="alert"
                            className="border-t border-warning/40 bg-warning-soft px-4 py-3"
                        >
                            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 type-body text-warning">
                                <p className="min-w-0 flex-1">
                                    Reset the demo workspace? Practice edits will
                                    be lost and the recording will return to its
                                    first step.
                                </p>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={confirmReset}
                                >
                                    Reset and discard edits
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setConfirmingReset(false)}
                                >
                                    Keep editing
                                </Button>
                            </div>
                        </div>
                    ) : null}
                    {workspace.error ? (
                        <p className="border-t border-separator px-4 py-2 type-meta text-ink-muted">
                            {workspace.error}
                        </p>
                    ) : null}
                    <p aria-live="polite" className="sr-only">
                        {announcement}
                    </p>
                </>
            }
        >
            {children}
        </AppShell>
    );
}
