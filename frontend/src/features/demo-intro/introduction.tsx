"use client";

import {
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppearanceOptional } from "@/components/appearance/provider";
import {
    replayEntryFailureMessage,
    type DemoEntryReadiness,
} from "@/features/demo-entry";
import { IntroFallback } from "./intro-fallback";
import { IntroMoments } from "./intro-moments";
import { IntroScene } from "./intro-scene";
import { useDemoIntro } from "./provider";
import { INTRO_STEPS } from "./steps";

function focusSoon(target: () => HTMLElement | null) {
    const run = () => target()?.focus();
    if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(run);
    } else {
        window.setTimeout(run, 0);
    }
}

const subscribeToNothing = () => () => {};
const getClientHydrated = () => true;
const getServerHydrated = () => false;

function subscribeToViewport(callback: () => void): () => void {
    window.addEventListener("resize", callback);
    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["style", "class"],
    });
    return () => {
        window.removeEventListener("resize", callback);
        observer.disconnect();
    };
}

function getCompactSnapshot(): boolean {
    const rootFont = Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize
    );
    return (
        (window.innerWidth < 760 && window.innerHeight < 560) ||
        rootFont >= 24
    );
}

function useCompactFallback(): boolean {
    return useSyncExternalStore(
        subscribeToViewport,
        getCompactSnapshot,
        () => false
    );
}

export function Introduction({
    readiness,
}: {
    readiness: DemoEntryReadiness;
}) {
    const intro = useDemoIntro();
    const appearance = useAppearanceOptional();
    const contentRef = useRef<HTMLDivElement>(null);
    const mounted = useSyncExternalStore(
        subscribeToNothing,
        getClientHydrated,
        getServerHydrated
    );
    const [webglUnavailable, setWebglUnavailable] = useState(false);
    const compactFallback = useCompactFallback();
    const activeStepSetter = intro.setActiveStep;

    const dark = mounted ? appearance?.resolved !== "light" : true;
    const reducedMotion = appearance?.reducedMotion ?? false;
    const fallback =
        reducedMotion || compactFallback || webglUnavailable;

    const ready =
        readiness.sessionStatus === "ready" &&
        readiness.safeConfigStatus === "ready";
    const statusMessage = readiness.sessionError
        ? replayEntryFailureMessage("session", readiness.sessionError)
        : readiness.safeConfigError
          ? replayEntryFailureMessage("metadata", readiness.safeConfigError)
          : null;

    const progress = Math.min(
        Math.max(intro.stepIndex, 0),
        INTRO_STEPS.length - 1
    );

    useEffect(() => {
        if (!intro.open) return;
        activeStepSetter(0);
        const timer = window.setTimeout(() => {
            const target = contentRef.current?.querySelector<HTMLElement>(
                '[data-intro-node="copy-0"] .intro-copy__title, #intro-fallback-heading-0'
            );
            if (target) {
                target.focus({ preventScroll: true });
            } else {
                contentRef.current?.focus({ preventScroll: true });
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [activeStepSetter, intro.open]);

    const stepLabel = useMemo(
        () => `Step ${progress + 1} of ${INTRO_STEPS.length}`,
        [progress]
    );

    return (
        <Dialog.Root
            open={intro.open}
            onOpenChange={(open) => {
                if (!open) intro.close();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="intro-overlay" />
                <Dialog.Content
                    ref={contentRef}
                    data-testid="demo-introduction"
                    data-intro-mode={fallback ? "fallback" : "scene"}
                    className="intro-dialog"
                    aria-busy={!ready}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        focusSoon(
                            () =>
                                contentRef.current?.querySelector<HTMLElement>(
                                    '[data-intro-node="copy-0"] .intro-copy__title, #intro-fallback-heading-0'
                                ) ??
                                contentRef.current
                        );
                    }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        const target = intro.consumeReturnFocus();
                        focusSoon(() =>
                            target && target.isConnected
                                ? target
                                : (document.getElementById(
                                      "main-content"
                                  ) as HTMLElement | null) ??
                                  document.body
                        );
                    }}
                >
                    <Dialog.Title className="sr-only">
                        Demo introduction
                    </Dialog.Title>
                    <Dialog.Description className="sr-only">
                        Four moments introduce the Sabha demo, then Enter the
                        demo opens the workspace.
                    </Dialog.Description>

                    {fallback ? (
                        <IntroFallback
                            dark={dark}
                            onActiveMoment={intro.setActiveStep}
                        />
                    ) : (
                        <IntroScene
                            open={intro.open}
                            dark={dark}
                            onUnavailable={() => setWebglUnavailable(true)}
                            onActiveMoment={intro.setActiveStep}
                        >
                            <IntroMoments />
                        </IntroScene>
                    )}

                    <footer className="intro-rail">
                        <div
                            className="intro-progress"
                            aria-hidden="true"
                            data-progress={progress}
                        >
                            {INTRO_STEPS.map((step, index) => (
                                <span
                                    key={step.id}
                                    className="intro-progress__segment"
                                    data-state={
                                        index < progress
                                            ? "complete"
                                            : index === progress
                                              ? "active"
                                              : "upcoming"
                                    }
                                />
                            ))}
                        </div>
                        <p className="sr-only" aria-live="polite">
                            {stepLabel}
                        </p>
                        <div className="intro-controls">
                            <button
                                type="button"
                                className="intro-control intro-control--quiet"
                                onClick={intro.skip}
                            >
                                Skip introduction
                            </button>
                            {statusMessage ? (
                                <div
                                    className="intro-readiness"
                                    role="alert"
                                >
                                    <span>{statusMessage}</span>
                                    <button
                                        type="button"
                                        className="intro-control intro-control--retry"
                                        onClick={readiness.retryEntry}
                                    >
                                        Try again
                                    </button>
                                </div>
                            ) : !ready ? (
                                <p
                                    className="intro-readiness"
                                    role="status"
                                >
                                    Preparing the demo.
                                </p>
                            ) : null}
                            <button
                                type="button"
                                className="intro-control intro-control--enter"
                                onClick={intro.enter}
                                disabled={!ready}
                            >
                                Enter the demo
                            </button>
                        </div>
                    </footer>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
