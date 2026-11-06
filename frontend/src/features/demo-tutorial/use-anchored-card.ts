"use client";

/**
 * Anchored card positioning (spec-29).
 *
 * One floating layer, placed next to the real control. `flip` keeps the card
 * inside the viewport, `shift` handles edges and safe areas, `hide` collapses
 * when the control leaves the screen and `size` bounds the card width so
 * nothing overflows at 390px.
 */
import { useEffect, useState } from "react";
import {
    autoUpdate,
    computePosition,
    flip,
    offset,
    shift,
    size,
    type Placement,
} from "@floating-ui/react-dom";

export interface AnchoredCardState {
    x: number;
    y: number;
    placement: Placement;
    visible: boolean;
    target: { left: number; top: number; width: number; height: number };
}

export interface AnchoredCardOptions {
    gap?: number;
    margin?: number;
    maxWidth?: number;
    enabled?: boolean;
    /**
     * Other real controls the card must not cover. The tutorial may point at
     * one task while the director dock holds several adjacent actions.
     */
    avoid?: readonly HTMLElement[];
}

export const CARD_MAX_WIDTH = 320;
export const CARD_GAP = 12;
export const CARD_MARGIN = 12;

function overlaps(
    box: { left: number; top: number; right: number; bottom: number },
    target: DOMRect
): boolean {
    return !(
        box.right <= target.left ||
        box.left >= target.right ||
        box.bottom <= target.top ||
        box.top >= target.bottom
    );
}

export function useAnchoredCard(
    target: HTMLElement | null,
    floating: HTMLElement | null,
    options: AnchoredCardOptions = {}
): AnchoredCardState | null {
    const {
        gap = CARD_GAP,
        margin = CARD_MARGIN,
        maxWidth = CARD_MAX_WIDTH,
        enabled = true,
        avoid = [],
    } = options;
    const [state, setState] = useState<AnchoredCardState | null>(null);

    useEffect(() => {
        if (!target || !floating || !enabled) {
            return;
        }

        let cancelled = false;
        const update = () => {
            const viewportWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                0;
            const viewportHeight =
                window.innerHeight ||
                document.documentElement.clientHeight ||
                0;
            const avoidRects = avoid
                .filter((element) => element && element !== target)
                .map((element) => element.getBoundingClientRect())
                .filter(
                    (rect) =>
                        rect.width > 0 &&
                        rect.height > 0 &&
                        rect.bottom > 0 &&
                        rect.top < viewportHeight &&
                        rect.right > 0 &&
                        rect.left < viewportWidth
                );

            const measure = (placement: Placement) =>
                computePosition(target, floating, {
                    placement,
                    strategy: "fixed",
                    middleware: [
                        offset(gap),
                        // Keep the default bottom placement's viewport flip,
                        // but let the explicit alternatives below choose their
                        // own side without flipping back over the target.
                        ...(placement === "bottom"
                            ? [flip({ padding: margin })]
                            : []),
                        shift({ padding: margin, crossAxis: true }),
                        size({
                            padding: margin,
                            apply({
                                availableWidth,
                                availableHeight,
                                elements,
                            }) {
                                const width = Math.max(
                                    200,
                                    Math.min(availableWidth, maxWidth)
                                );
                                Object.assign(elements.floating.style, {
                                    maxWidth: `${width}px`,
                                    maxHeight: `${Math.max(
                                        120,
                                        availableHeight
                                    )}px`,
                                });
                            },
                        }),
                    ],
                });

            const place = async () => {
                const preferred: Placement[] = [
                    "bottom",
                    "top",
                    "bottom-start",
                    "top-start",
                    "right-start",
                    "left-start",
                ];
                let chosen: {
                    x: number;
                    y: number;
                    placement: Placement;
                } | null = null;
                let resolved = false;
                let cardWidth = 0;
                let cardHeight = 0;

                for (const placement of preferred) {
                    const result = await measure(placement);
                    if (cancelled) return;

                    // Measure from the computed coordinates, not the element's
                    // current rect: the card has not been positioned yet on the
                    // first pass.
                    const width =
                        floating.offsetWidth ||
                        floating.getBoundingClientRect().width;
                    const height =
                        floating.offsetHeight ||
                        floating.getBoundingClientRect().height;
                    if (!width || !height) {
                        // A zero-size card cannot cover a control; test
                        // renderers and pre-layout frames report no box yet.
                        chosen = result;
                        resolved = true;
                        break;
                    }
                    cardWidth = width;
                    cardHeight = height;

                    const box = {
                        left: result.x,
                        top: result.y,
                        right: result.x + width,
                        bottom: result.y + height,
                    };
                    const targetRect = target.getBoundingClientRect();
                    const viewportWidth =
                        window.innerWidth ||
                        document.documentElement.clientWidth ||
                        0;
                    const viewportHeight =
                        window.innerHeight ||
                        document.documentElement.clientHeight ||
                        0;
                    const inViewport =
                        box.left >= 0 &&
                        box.top >= 0 &&
                        box.right <= viewportWidth &&
                        box.bottom <= viewportHeight;
                    const clear =
                        inViewport &&
                        !overlaps(box, targetRect) &&
                        !avoidRects.some((rect) => overlaps(box, rect));
                    if (clear) {
                        chosen = result;
                        resolved = true;
                        break;
                    }
                    if (!chosen) chosen = result;
                }

                if (!chosen) return;

                // In a compact dock there may be no free side of the target:
                // every relative placement can overlap a neighbouring control.
                // Fall back to the free band above or below the whole obstacle
                // group before collapsing to the compact bar.
                if (!resolved && cardWidth && cardHeight) {
                    const obstacles = [
                        target.getBoundingClientRect(),
                        ...avoidRects,
                    ];
                    const left = Math.min(
                        ...obstacles.map((rect) => rect.left)
                    );
                    const right = Math.max(
                        ...obstacles.map((rect) => rect.right)
                    );
                    const top = Math.min(
                        ...obstacles.map((rect) => rect.top)
                    );
                    const bottom = Math.max(
                        ...obstacles.map((rect) => rect.bottom)
                    );
                    const viewportWidth =
                        window.innerWidth ||
                        document.documentElement.clientWidth ||
                        0;
                    const viewportHeight =
                        window.innerHeight ||
                        document.documentElement.clientHeight ||
                        0;
                    const x = Math.max(
                        margin,
                        Math.min(
                            left + (right - left) / 2 - cardWidth / 2,
                            viewportWidth - cardWidth - margin
                        )
                    );
                    const above = top - gap - cardHeight;
                    const below = bottom + gap;
                    const fits = (y: number) =>
                        y >= margin &&
                        y + cardHeight <= viewportHeight - margin;
                    if (fits(above)) {
                        chosen = { x, y: above, placement: "top" };
                        resolved = true;
                    } else if (fits(below)) {
                        chosen = { x, y: below, placement: "bottom" };
                        resolved = true;
                    }
                }

                const { x, y, placement } = chosen;
                const width =
                    floating.offsetWidth ||
                    floating.getBoundingClientRect().width;
                const height =
                    floating.offsetHeight ||
                    floating.getBoundingClientRect().height;
                const targetRect = target.getBoundingClientRect();
                const measurable = width > 0 && height > 0;
                const onScreen =
                    targetRect.bottom >= 0 &&
                    targetRect.right >= 0 &&
                    targetRect.top <= viewportHeight &&
                    targetRect.left <= viewportWidth;
                const box = {
                    left: x,
                    top: y,
                    right: x + width,
                    bottom: y + height,
                };

                setState({
                    x,
                    y,
                    placement,
                    target: {
                        left: targetRect.left,
                        top: targetRect.top,
                        width: targetRect.width,
                        height: targetRect.height,
                    },
                    visible:
                        onScreen &&
                        (!measurable ||
                            (!overlaps(box, targetRect) &&
                                !avoidRects.some((rect) =>
                                    overlaps(box, rect)
                                ) &&
                                box.left >= 0 &&
                                box.top >= 0 &&
                                box.right <= viewportWidth &&
                                box.bottom <= viewportHeight)),
                });
            };

            void place().catch((error: unknown) => {
                if (cancelled) return;
                // A positioning failure must never break the room: keep the
                // compact bar and report nothing else.
                console.error("demo tutorial positioning failed", error);
            });
        };

        let cleanup: () => void;
        try {
            cleanup = autoUpdate(target, floating, update, {
                ancestorScroll: true,
                ancestorResize: true,
                elementResize: true,
                layoutShift: true,
            });
        } catch {
            // Test renderers and older browsers may not expose
            // ResizeObserver/IntersectionObserver. Keep measuring on the
            // window events the HUD actually needs.
            update();
            window.addEventListener("scroll", update, true);
            window.addEventListener("resize", update);
            cleanup = () => {
                window.removeEventListener("scroll", update, true);
                window.removeEventListener("resize", update);
            };
        }

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [target, floating, enabled, gap, margin, maxWidth, avoid]);

    if (!target || !floating || !enabled) return null;
    return state;
}
