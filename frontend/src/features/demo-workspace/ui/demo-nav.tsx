"use client";

/**
 * Persistent demo chrome (spec-23).
 *
 * The nav is the only place that advertises workspace destinations, so a
 * feature is linked here only once its demo adapter exists. Practice state is
 * browser memory; the Demo badge and reset copy keep that visible.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAnchorRef, type TutorialAnchorId } from "@/features/demo-tutorial";
import { AppearanceMenu } from "@/components/appearance";
import { Button } from "@/components/ui/button";
import { useDemoWorkspace } from "../provider";

interface Destination {
    href: string;
    label: string;
    exact: boolean;
    anchor?: TutorialAnchorId;
}

const DESTINATIONS: readonly Destination[] = [
    { href: "/demo", label: "Board", exact: true },
    { href: "/demo/new", label: "New meeting", exact: true },
    {
        href: "/demo/roster",
        label: "Personas",
        exact: false,
        anchor: "nav.personas",
    },
    {
        href: "/demo/knowledge-stacks",
        label: "Knowledge",
        exact: false,
        anchor: "nav.knowledge",
    },
    { href: "/demo/meetings", label: "Meetings", exact: false },
    { href: "/demo/settings", label: "Demo settings", exact: true },
];

function DestinationLink({
    destination,
    active,
}: {
    destination: Destination;
    active: boolean;
}) {
    const ref = useAnchorRef(destination.anchor ?? null);
    return (
        <Link
            ref={ref}
            href={destination.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-control px-3 py-1.5 type-control m-control ${
                active
                    ? "bg-surface-selected text-ink"
                    : "text-ink-secondary hover:bg-surface-raised hover:text-ink"
            }`}
        >
            {destination.label}
        </Link>
    );
}

export function DemoNav() {
    const pathname = usePathname();
    const workspace = useDemoWorkspace();
    const [confirmingReset, setConfirmingReset] = useState(false);
    const [announcement, setAnnouncement] = useState("");

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
        <header className="material-chrome relative z-chrome border-b border-separator text-ink">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="inline-flex min-h-8 items-center rounded-full border border-warning/40 bg-warning-soft px-3 py-1 type-control font-semibold uppercase tracking-wide text-warning">
                        Demo
                    </span>
                </div>

                <nav
                    aria-label="Demo workspace"
                    className="flex flex-wrap items-center gap-1 type-control"
                >
                    {DESTINATIONS.map((destination) => {
                        const active = destination.exact
                            ? pathname === destination.href
                            : pathname === destination.href ||
                              pathname.startsWith(`${destination.href}/`);
                        return (
                            <DestinationLink
                                key={destination.href}
                                destination={destination}
                                active={active}
                            />
                        );
                    })}
                </nav>

                <div className="ml-auto flex items-center gap-3">
                    <AppearanceMenu />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={requestReset}
                    >
                        Reset demo
                    </Button>
                </div>
            </div>

            {confirmingReset ? (
                <div className="border-t border-warning/40 bg-warning-soft px-4 py-3">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 type-body text-warning">
                        <p className="flex-1">
                            Reset the demo workspace? Practice edits will be lost
                            and the recording will return to its first step.
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
        </header>
    );
}
