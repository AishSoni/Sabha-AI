"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { DemoEntryReadiness } from "@/features/demo-entry";
import { DemoEntryShell } from "./entry-shell";
import { Introduction } from "./introduction";
import { useDemoIntro } from "./provider";

/**
 * The single entry gate. It owns which of three surfaces is visible:
 * the introduction, the direct-entry shell, or the ready workspace.
 */
export function DemoEntryGate({
    children,
    readiness,
}: {
    children: ReactNode;
    readiness: DemoEntryReadiness;
}) {
    const intro = useDemoIntro();
    const wasEntered = useRef(intro.hasEntered);
    const wasReady = useRef(false);

    const ready =
        readiness.sessionStatus === "ready" &&
        readiness.safeConfigStatus === "ready";

    useEffect(() => {
        if (!intro.hasEntered || intro.open) {
            wasEntered.current = intro.hasEntered;
            return;
        }
        if (wasEntered.current) return;
        wasEntered.current = true;
        const timer = window.setTimeout(() => {
            document.getElementById("main-content")?.focus();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [intro.hasEntered, intro.open]);

    useEffect(() => {
        if (!ready) {
            wasReady.current = false;
            return;
        }
        if (wasReady.current) return;
        wasReady.current = true;
        if (!intro.hasEntered || intro.open) return;
        const timer = window.setTimeout(() => {
            document.getElementById("main-content")?.focus();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [intro.hasEntered, intro.open, ready]);

    if (!intro.hasEntered) {
        return <Introduction readiness={readiness} />;
    }

    if (!ready) {
        return intro.open ? (
            <Introduction readiness={readiness} />
        ) : (
            <DemoEntryShell readiness={readiness} />
        );
    }

    return (
        <>
            <div
                inert={intro.open || undefined}
                aria-hidden={intro.open || undefined}
            >
                {children}
            </div>
            {intro.open ? <Introduction readiness={readiness} /> : null}
        </>
    );
}

/** Compatibility alias for existing imports. */
export const DemoIntroGate = DemoEntryGate;
