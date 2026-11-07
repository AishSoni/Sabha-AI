"use client";

import { useSyncExternalStore } from "react";

function getMatch(query: string, fallback: boolean): boolean {
    if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
    ) {
        return fallback;
    }
    return window.matchMedia(query).matches;
}

/**
 * Reads a media query without rendering two competing navigation trees.
 *
 * The server snapshot defaults to wide so the desktop chrome is complete in
 * the first HTML response; a compact client immediately replaces it with the
 * labelled menu. Anchors therefore always attach to one real control.
 */
export function useMediaQuery(query: string, serverDefault = true): boolean {
    return useSyncExternalStore(
        (onChange) => {
            if (
                typeof window === "undefined" ||
                typeof window.matchMedia !== "function"
            ) {
                return () => undefined;
            }
            const media = window.matchMedia(query);
            media.addEventListener("change", onChange);
            return () => media.removeEventListener("change", onChange);
        },
        () => getMatch(query, serverDefault),
        () => serverDefault
    );
}
