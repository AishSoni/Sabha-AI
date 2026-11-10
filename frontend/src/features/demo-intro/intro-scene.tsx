"use client";

import {
    useCallback,
    useEffect,
    useRef,
    type ReactNode,
} from "react";
import { INTRO_MAX_PROGRESS } from "./scene-config";
import { IntroSceneRenderer } from "./scene-renderer";

const KEY_STEP = 0.22;
const PAGE_STEP = 0.62;

function isInteractive(target: EventTarget | null): boolean {
    return (
        target instanceof Element &&
        Boolean(
            target.closest(
                "button, a, input, select, textarea, [contenteditable='true']"
            )
        )
    );
}

export function IntroScene({
    children,
    dark,
    open,
    onUnavailable,
    onActiveMoment,
    className,
}: {
    children: ReactNode;
    dark: boolean;
    open: boolean;
    onUnavailable(): void;
    onActiveMoment(moment: number): void;
    className?: string;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<IntroSceneRenderer | null>(null);
    const progressRef = useRef(0);
    const targetRef = useRef(0);
    const velocityRef = useRef(0);
    const frameRef = useRef(0);
    const lastTimestampRef = useRef(0);
    const touchYRef = useRef<number | null>(null);
    const unavailableRef = useRef(onUnavailable);
    const activeMomentRef = useRef(onActiveMoment);

    useEffect(() => {
        unavailableRef.current = onUnavailable;
        activeMomentRef.current = onActiveMoment;
    }, [onActiveMoment, onUnavailable]);

    const settle = useCallback(() => {
        if (frameRef.current) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = 0;
        }
        lastTimestampRef.current = 0;
    }, []);

    const start = useCallback(() => {
        if (frameRef.current || !sceneRef.current) return;
        const tick = (timestamp: number) => {
            const scene = sceneRef.current;
            if (!scene) {
                frameRef.current = 0;
                return;
            }
            const previous = lastTimestampRef.current || timestamp;
            const dt = Math.min(Math.max((timestamp - previous) / 1000, 0.001), 0.05);
            lastTimestampRef.current = timestamp;
            const target = targetRef.current;
            const current = progressRef.current;
            const difference = target - current;
            const easing = 1 - Math.exp(-dt * 7.5);
            const next =
                Math.abs(difference) < 0.0008
                    ? target
                    : current + difference * easing;
            const velocity = (next - current) / dt;
            progressRef.current = next;
            velocityRef.current = velocity;
            scene.setProgress(next, velocity);
            if (Math.abs(target - next) < 0.0008) {
                progressRef.current = target;
                velocityRef.current = 0;
                scene.setProgress(target, 0);
                frameRef.current = 0;
                lastTimestampRef.current = 0;
                return;
            }
            frameRef.current = requestAnimationFrame(tick);
        };
        lastTimestampRef.current = 0;
        frameRef.current = requestAnimationFrame(tick);
    }, []);

    const addDistance = useCallback(
        (distance: number) => {
            targetRef.current = Math.min(
                Math.max(targetRef.current + distance, 0),
                INTRO_MAX_PROGRESS
            );
            start();
        },
        [start]
    );

    useEffect(() => {
        if (!open) {
            settle();
            return;
        }
        const root = rootRef.current;
        const canvas = canvasRef.current;
        if (!root || !canvas) return;

        let renderer: IntroSceneRenderer | null = null;
        try {
            renderer = new IntroSceneRenderer({
                root,
                canvas,
                dark,
                onUnavailable: () => unavailableRef.current(),
                onActiveMoment: (moment) => activeMomentRef.current(moment),
            });
            sceneRef.current = renderer;
        } catch {
            unavailableRef.current();
            return;
        }

        const onWheel = (event: WheelEvent) => {
            if (isInteractive(event.target)) return;
            event.preventDefault();
            const unit =
                event.deltaMode === 1
                    ? 16
                    : event.deltaMode === 2
                      ? window.innerHeight
                      : 1;
            const distance = Math.min(
                Math.max(event.deltaY * unit * 0.0015, -0.4),
                0.4
            );
            addDistance(distance);
        };

        const onTouchStart = (event: TouchEvent) => {
            if (isInteractive(event.target)) return;
            touchYRef.current = event.touches[0]?.clientY ?? null;
        };

        const onTouchMove = (event: TouchEvent) => {
            if (isInteractive(event.target) || touchYRef.current === null) return;
            const nextY = event.touches[0]?.clientY;
            if (typeof nextY !== "number") return;
            event.preventDefault();
            const delta = (touchYRef.current - nextY) * 0.0022;
            touchYRef.current = nextY;
            addDistance(Math.min(Math.max(delta, -0.32), 0.32));
        };

        const onTouchEnd = () => {
            touchYRef.current = null;
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (isInteractive(event.target)) return;
            let distance = 0;
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                distance = KEY_STEP;
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                distance = -KEY_STEP;
            } else if (event.key === "PageDown") {
                distance = PAGE_STEP;
            } else if (event.key === "PageUp") {
                distance = -PAGE_STEP;
            } else if (event.key === "Home") {
                event.preventDefault();
                targetRef.current = 0;
                start();
                return;
            } else if (event.key === "End") {
                event.preventDefault();
                targetRef.current = INTRO_MAX_PROGRESS;
                start();
                return;
            } else {
                return;
            }
            event.preventDefault();
            addDistance(distance);
        };

        const onPointerMove = (event: PointerEvent) => {
            if (event.pointerType === "touch") return;
            const bounds = root.getBoundingClientRect();
            renderer?.setPointer(
                ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
                ((event.clientY - bounds.top) / bounds.height) * 2 - 1
            );
        };

        const onPointerLeave = () => {
            renderer?.setPointer(0, 0);
        };

        const onContextLost = (event: Event) => {
            event.preventDefault();
            settle();
            unavailableRef.current();
        };

        canvas.addEventListener("webglcontextlost", onContextLost);
        root.addEventListener("wheel", onWheel, { passive: false });
        root.addEventListener("touchstart", onTouchStart, { passive: true });
        root.addEventListener("touchmove", onTouchMove, { passive: false });
        root.addEventListener("touchend", onTouchEnd, { passive: true });
        root.addEventListener("pointermove", onPointerMove, { passive: true });
        root.addEventListener("pointerleave", onPointerLeave);
        root.addEventListener("keydown", onKeyDown);
        const resizeObserver = new ResizeObserver(() => renderer?.resize());
        resizeObserver.observe(root);

        targetRef.current = 0;
        progressRef.current = 0;
        velocityRef.current = 0;
        renderer.reset();

        return () => {
            settle();
            resizeObserver.disconnect();
            canvas.removeEventListener("webglcontextlost", onContextLost);
            root.removeEventListener("wheel", onWheel);
            root.removeEventListener("touchstart", onTouchStart);
            root.removeEventListener("touchmove", onTouchMove);
            root.removeEventListener("touchend", onTouchEnd);
            root.removeEventListener("pointermove", onPointerMove);
            root.removeEventListener("pointerleave", onPointerLeave);
            root.removeEventListener("keydown", onKeyDown);
            sceneRef.current = null;
            renderer?.dispose();
        };
    }, [addDistance, dark, open, settle, start]);

    return (
        <div
            ref={rootRef}
            className={`intro-scene${className ? ` ${className}` : ""}`}
            data-intro-scene
        >
            <canvas
                ref={canvasRef}
                className="intro-scene__canvas"
                aria-hidden="true"
            />
            <div className="intro-scene__content">{children}</div>
        </div>
    );
}
