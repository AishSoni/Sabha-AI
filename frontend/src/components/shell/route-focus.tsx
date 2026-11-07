"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Moves focus to the new route's main landmark without stealing the browser's
 * back/forward scroll position. Initial hydration is deliberately skipped.
 */
export function RouteFocus() {
    const pathname = usePathname();
    const previous = useRef(pathname);

    useEffect(() => {
        if (previous.current === pathname) return;
        previous.current = pathname;
        const frame = window.requestAnimationFrame(() => {
            document
                .getElementById("main-content")
                ?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [pathname]);

    return null;
}
