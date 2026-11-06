import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { useAnchoredCard } from "./use-anchored-card";

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

const CARD: Box = { x: 0, y: 0, width: 240, height: 80 };
let target: Box = { x: 100, y: 100, width: 120, height: 40 };
let avoidBox: Box = { x: 100, y: 155, width: 240, height: 80 };

function makeRect(box: Box): DOMRect {
    return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        top: box.y,
        right: box.x + box.width,
        bottom: box.y + box.height,
        left: box.x,
        toJSON: () => box,
    } as DOMRect;
}

function Probe({ avoid = false }: { avoid?: boolean }) {
    const targetRef = useRef<HTMLButtonElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const avoidRef = useRef<HTMLDivElement>(null);
    const [elements, setElements] = useState<{
        target: HTMLElement | null;
        card: HTMLElement | null;
        avoid: HTMLElement | null;
    }>({ target: null, card: null, avoid: null });

    useEffect(() => {
        setElements({
            target: targetRef.current,
            card: cardRef.current,
            avoid: avoidRef.current,
        });
    }, []);

    const state = useAnchoredCard(elements.target, elements.card, {
        avoid:
            avoid && elements.avoid ? [elements.avoid] : [],
    });

    return (
        <div>
            <button ref={targetRef} data-testid="target">
                Anchor
            </button>
            <div ref={avoidRef} data-testid="avoid" />
            <div
                ref={cardRef}
                data-testid="card"
                data-visible={state ? String(state.visible) : "unset"}
                data-placement={state?.placement ?? ""}
                data-x={state ? String(Math.round(state.x)) : ""}
                data-y={state ? String(Math.round(state.y)) : ""}
                style={{
                    position: "fixed",
                    left: state?.x ?? 0,
                    top: state?.y ?? 0,
                    width: CARD.width,
                    height: CARD.height,
                }}
            />
        </div>
    );
}

beforeEach(() => {
    Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: 1024,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
        configurable: true,
        value: 768,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        function mockRect(this: HTMLElement) {
            if (this.dataset.testid === "target") return makeRect(target);
            if (this.dataset.testid === "avoid") return makeRect(avoidBox);
            if (this.dataset.testid === "card") return makeRect(CARD);
            return makeRect({ x: 0, y: 0, width: 0, height: 0 });
        }
    );
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get() {
            return this.dataset?.testid === "target" ? target.width : CARD.width;
        },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
            return this.dataset?.testid === "target" ? target.height : CARD.height;
        },
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("useAnchoredCard", () => {
    it("places the card below the control without covering it", async () => {
        target = { x: 100, y: 100, width: 120, height: 40 };
        render(<Probe />);
        const card = screen.getByTestId("card");
        await waitFor(() =>
            expect(card).toHaveAttribute("data-visible", "true")
        );
        expect(card).toHaveAttribute("data-placement", "bottom");
        expect(Number(card.dataset.y)).toBeGreaterThanOrEqual(
            target.y + target.height
        );
    });

    it("flips above a control near the bottom edge", async () => {
        target = { x: 100, y: 700, width: 120, height: 40 };
        render(<Probe />);
        const card = screen.getByTestId("card");
        await waitFor(() => expect(card).toHaveAttribute("data-placement", "top"));
        expect(Number(card.dataset.y) + CARD.height).toBeLessThanOrEqual(
            target.y
        );
    });

    it("shifts inside the viewport at the right edge", async () => {
        target = { x: 950, y: 100, width: 120, height: 40 };
        render(<Probe />);
        const card = screen.getByTestId("card");
        await waitFor(() =>
            expect(card).toHaveAttribute("data-visible", "true")
        );
        expect(Number(card.dataset.x) + CARD.width).toBeLessThanOrEqual(
            window.innerWidth
        );
    });

    it("moves away from another real control in the same dock", async () => {
        target = { x: 100, y: 100, width: 120, height: 40 };
        avoidBox = { x: 100, y: 155, width: 240, height: 80 };
        render(<Probe avoid />);
        const card = screen.getByTestId("card");
        await waitFor(() =>
            expect(card).toHaveAttribute("data-visible", "true")
        );
        expect(card).toHaveAttribute("data-placement", "top");
        expect(Number(card.dataset.y) + CARD.height).toBeLessThanOrEqual(
            target.y
        );
    });

    it("reports the card hidden when the control left the viewport", async () => {
        target = { x: 100, y: 900, width: 120, height: 40 };
        render(<Probe />);
        await waitFor(() =>
            expect(screen.getByTestId("card")).toHaveAttribute(
                "data-visible",
                "false"
            )
        );
    });
});
