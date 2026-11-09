"use client";

/**
 * The entrance gate. A first-time visitor sees only the introduction; after
 * acknowledgement the workspace mounts. A deliberate revisit keeps the
 * workspace mounted behind an inert layer so playback and practice state do
 * not reset.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Introduction } from "./introduction";
import { useDemoIntro } from "./provider";

export function DemoIntroGate({ children }: { children: ReactNode }) {
    const intro = useDemoIntro();
    const wasEntered = useRef(intro.hasEntered);

    useEffect(() => {
        if (wasEntered.current || !intro.hasEntered) {
            wasEntered.current = intro.hasEntered;
            return;
        }
        wasEntered.current = true;
        const timer = window.setTimeout(() => {
            document.getElementById("main-content")?.focus();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [intro.hasEntered]);

    if (!intro.hasEntered) {
        return <Introduction withAtmosphere />;
    }

    return (
        <>
            <div
                inert={intro.open || undefined}
                aria-hidden={intro.open || undefined}
            >
                {children}
            </div>
            <Introduction withAtmosphere={false} />
        </>
    );
}
