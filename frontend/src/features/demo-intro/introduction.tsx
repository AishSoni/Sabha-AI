"use client";

/**
 * The single full-screen introduction composition (spec-41).
 *
 * The frame stays recognisable across all four steps; only the message and its
 * meaningful visual change. Controls are native buttons, focus starts on the
 * heading, and no transition gates access to Skip, Back or Continue.
 */
import { useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Starfield } from "@/components/atmosphere";
import { SabhaMark } from "@/components/brand/sabha-logo";
import { INTRO_STEPS } from "./steps";
import { useDemoIntro } from "./provider";
import { IntroVisual } from "./visuals";

function focusSoon(target: (() => HTMLElement | null) | null) {
    const run = () => {
        const element = target ? target() : document.getElementById("main-content");
        element?.focus();
    };
    if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(run);
    } else {
        window.setTimeout(run, 0);
    }
}

export function Introduction({ withAtmosphere }: { withAtmosphere: boolean }) {
    const intro = useDemoIntro();
    const headingRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        if (!intro.open) return;
        headingRef.current?.focus();
    }, [intro.open]);

    return (
        <Dialog.Root
            open={intro.open}
            onOpenChange={(open) => {
                if (!open) intro.close();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="m-dialog-overlay fixed inset-0 z-[90] bg-canvas/95 backdrop-blur-sm" />
                <Dialog.Content
                    data-testid="demo-introduction"
                    className="m-dialog-content fixed inset-0 z-[100] overflow-y-auto bg-canvas text-ink outline-none"
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        headingRef.current?.focus();
                    }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        const target = intro.consumeReturnFocus();
                        focusSoon(() =>
                            target && target.isConnected
                                ? target
                                : document.getElementById("main-content")
                        );
                    }}
                >
                    {withAtmosphere ? (
                        <div className="pointer-events-none fixed inset-0" aria-hidden="true">
                            <Starfield density="subtle" parallax={false} meteors={false} />
                        </div>
                    ) : null}

                    <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
                        <header className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <SabhaMark idPrefix="demo-intro" className="h-8 w-7" />
                                <span className="type-control font-semibold tracking-wide text-ink">
                                    Sabha
                                </span>
                                <span className="hidden type-meta text-ink-muted sm:inline">
                                    A directed meeting with AI participants
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={intro.skip}
                                className="m-control inline-flex min-h-10 items-center gap-1.5 rounded-control border border-control bg-surface px-3 type-control text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                <X className="size-4" aria-hidden="true" />
                                Skip introduction
                            </button>
                        </header>

                        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12 lg:py-10">
                            <section
                                aria-label="Introduction"
                                className="max-w-xl"
                            >
                                <p className="type-meta font-semibold uppercase tracking-[0.18em] text-action">
                                    {intro.step.eyebrow}
                                </p>
                                <Dialog.Title asChild>
                                    <h1
                                        ref={headingRef}
                                        tabIndex={-1}
                                        className="mt-3 type-page-title text-balance outline-none"
                                    >
                                        {intro.step.title}
                                    </h1>
                                </Dialog.Title>
                                <Dialog.Description asChild>
                                    <p className="mt-4 type-body text-ink-secondary">
                                        {intro.step.body}
                                    </p>
                                </Dialog.Description>
                                <p className="mt-5 max-w-lg border-l-2 border-action/40 pl-3 type-meta text-ink-muted">
                                    {intro.step.id === "example"
                                        ? "The example is historical and deliberately bounded. It is not a recommendation."
                                        : "This screen is an orientation. The meeting itself is the demo."}
                                </p>
                            </section>

                            <div className="material-solid w-full rounded-group border border-separator p-4 shadow-[var(--shadow-overlay)] sm:p-6">
                                <IntroVisual visual={intro.step.visual} />
                            </div>
                        </div>

                        <footer className="mt-auto border-t border-separator pt-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="flex items-center gap-1.5"
                                        aria-label={intro.stepLabel}
                                    >
                                        {INTRO_STEPS.map((step, index) => (
                                            <span
                                                key={step.id}
                                                aria-hidden="true"
                                                className={`h-2 rounded-full transition-[width,background-color] ${
                                                    index === intro.stepIndex
                                                        ? "w-6 bg-action"
                                                        : "w-2 bg-border-subtle"
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <p className="type-meta text-ink-muted" aria-live="polite">
                                        {intro.stepLabel}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={intro.back}
                                        disabled={intro.stepIndex === 0}
                                        className="m-control inline-flex min-h-10 items-center gap-1.5 rounded-control border border-control bg-surface px-3 type-control text-ink-secondary hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                    >
                                        <ArrowLeft className="size-4" aria-hidden="true" />
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        onClick={intro.next}
                                        className="m-control inline-flex min-h-10 items-center gap-2 rounded-control bg-action px-4 type-control font-medium text-action-foreground hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                    >
                                        {intro.stepIndex === INTRO_STEPS.length - 1
                                            ? "Enter the demo"
                                            : "Continue"}
                                        <ArrowRight className="size-4" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        </footer>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
