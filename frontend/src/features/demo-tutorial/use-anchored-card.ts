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
    hide,
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
    } = options;
    const [state, setState] = useState<AnchoredCardState | null>(null);

    useEffect(() => {
        if (!target || !floating || !enabled) {
            return;
        }

        let cancelled = false;
        const update = () => {
            void computePosition(target, floating, {
                placement: "bottom",
                strategy: "fixed",
                middleware: [
                    offset(gap),
                    flip({ padding: margin }),
                    shift({ padding: margin, crossAxis: true }),
                    hide({ padding: 4 }),
                    size({
                        padding: margin,
                        apply({ availableWidth, availableHeight, elements }) {
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
            }).then(({ x, y, placement, middlewareData }) => {
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
                const targetRect = target.getBoundingClientRect();
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
                        middlewareData.hide?.referenceHidden !== true &&
                        !overlaps(
                            {
                                left: x,
                                top: y,
                                right: x + width,
                                bottom: y + height,
                            },
                            targetRect
                        ),
                });
            });
        };

        const cleanup = autoUpdate(target, floating, update, {
            ancestorScroll: true,
            ancestorResize: true,
            elementResize: true,
            layoutShift: true,
        });

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [target, floating, enabled, gap, margin, maxWidth]);

    if (!target || !floating || !enabled) return null;
    return state;
}
