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
import { useDemoWorkspace } from "../provider";

const DESTINATIONS = [
    { href: "/demo", label: "Board", exact: true },
    { href: "/demo/new", label: "New meeting", exact: true },
    { href: "/demo/roster", label: "Personas", exact: false },
    { href: "/demo/knowledge-stacks", label: "Knowledge", exact: false },
    { href: "/demo/meetings", label: "Meetings", exact: false },
    { href: "/demo/settings", label: "Demo settings", exact: true },
] as const;

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
        <header className="border-b border-zinc-800 bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-200">
                        Demo
                    </span>
                    <span className="text-sm text-zinc-400">
                        Practice changes are temporary and never reach the operator workspace.
                    </span>
                </div>

                <nav
                    aria-label="Demo workspace"
                    className="flex flex-wrap items-center gap-1 text-sm"
                >
                    {DESTINATIONS.map((destination) => {
                        const active = destination.exact
                            ? pathname === destination.href
                            : pathname === destination.href ||
                              pathname.startsWith(`${destination.href}/`);
                        return (
                            <Link
                                key={destination.href}
                                href={destination.href}
                                aria-current={active ? "page" : undefined}
                                className={`rounded-md px-3 py-1.5 transition-colors ${
                                    active
                                        ? "bg-zinc-800 text-white"
                                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                                }`}
                            >
                                {destination.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="ml-auto flex items-center gap-3">
                    <button
                        type="button"
                        onClick={requestReset}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
                    >
                        Reset demo
                    </button>
                </div>
            </div>

            {confirmingReset ? (
                <div className="border-t border-amber-400/30 bg-amber-400/10 px-4 py-3">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 text-sm text-amber-100">
                        <p className="flex-1">
                            Reset the demo workspace? Practice edits will be lost
                            and the recording will return to its first step.
                        </p>
                        <button
                            type="button"
                            onClick={confirmReset}
                            className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-400"
                        >
                            Reset and discard edits
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmingReset(false)}
                            className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-amber-100 hover:bg-amber-400/10"
                        >
                            Keep editing
                        </button>
                    </div>
                </div>
            ) : null}

            {workspace.error ? (
                <p className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400">
                    {workspace.error}
                </p>
            ) : null}

            <p aria-live="polite" className="sr-only">
                {announcement}
            </p>
        </header>
    );
}
