"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IntroFallbackMoments } from "./intro-moments";
import { introPaletteAt } from "./palettes";

export function IntroFallback({
    dark,
    onActiveMoment,
}: {
    dark: boolean;
    onActiveMoment(moment: number): void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef(0);
    const [active, setActive] = useState(0);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const onScroll = () => {
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = 0;
                const midpoint = root.scrollTop + root.clientHeight * 0.45;
                let next = 0;
                const sections = root.querySelectorAll<HTMLElement>(
                    "[data-fallback-moment]"
                );
                sections.forEach((section, index) => {
                    if (section.offsetTop <= midpoint) next = index;
                });
                setActive(next);
                onActiveMoment(next);
            });
        };
        root.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            root.removeEventListener("scroll", onScroll);
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            frameRef.current = 0;
        };
    }, [onActiveMoment]);

    const palette = introPaletteAt(active, dark);
    const style = {
        "--intro-base": palette.base,
        "--intro-field-a": palette.fieldA,
        "--intro-field-b": palette.fieldB,
        "--intro-ink": palette.ink,
        "--intro-accent": palette.accent,
        "--intro-line": palette.line,
        "--intro-muted": `${palette.ink}ad`,
        "--intro-card": `${palette.card}dd`,
        "--intro-border": `${palette.border}52`,
    } as CSSProperties;

    return (
        <div
            ref={rootRef}
            className="intro-fallback"
            style={style}
            data-intro-fallback
        >
            <div className="intro-fallback__atmosphere" aria-hidden="true" />
            <IntroFallbackMoments />
        </div>
    );
}
