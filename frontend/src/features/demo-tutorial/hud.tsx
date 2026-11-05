"use client";

/**
 * The single tutorial HUD (spec-29).
 *
 * One instruction, anchored to the real control. The card never intercepts
 * pointer events outside itself, never moves focus and never advances the
 * journey. A missing or clipped anchor collapses it to the compact bar.
 */
import {
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Compass, Sparkles } from "lucide-react";
import { chapterHref, useReplayRun } from "@/features/meetings/presentation";
import { useAnchorCandidates } from "./anchors";
import type { TutorialAnchorId } from "./contract";
import { useDemoTutorial } from "./provider";
import { useModalOpen, useTutorialStreaming } from "./presence";
import { useAnchoredCard } from "./use-anchored-card";

const emptySubscribe = () => () => {};

/** Client-only render without an effect, so server markup stays empty. */
function useMounted(): boolean {
    return useSyncExternalStore(
        emptySubscribe,
        () => true,
        () => false
    );
}

export function TutorialHud() {
    const tutorial = useDemoTutorial();
    const mounted = useMounted();
    const [card, setCard] = useState<HTMLElement | null>(null);
    const modalOpen = useModalOpen();
    const streaming = useTutorialStreaming();

    const prompt = tutorial.prompt;
    const candidates: TutorialAnchorId[] = prompt
        ? ([prompt.anchor, ...(prompt.alternates ?? [])].filter(
              Boolean
          ) as TutorialAnchorId[])
        : [];
    const match = useAnchorCandidates(candidates);
    const position = useAnchoredCard(
        prompt?.anchor ? (match?.element ?? null) : null,
        card
    );

    const hasTarget = Boolean(prompt?.anchor);
    const anchored = !hasTarget || match !== null;
    const placed = !hasTarget || position?.visible === true;
    const suspended = modalOpen || streaming;
    const cardVisible =
        !tutorial.hidden && !suspended && anchored && placed;
    const compactVisible = !cardVisible && !suspended;
    const cardMounted = !tutorial.hidden && !suspended && anchored;

    if (!mounted || !prompt) return null;

    const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            tutorial.hide();
        }
    };

    const cardStyle: CSSProperties =
        position && hasTarget
            ? {
                  left: position.x,
                  top: position.y,
                  visibility: cardVisible ? "visible" : "hidden",
              }
            : {
                  left: "50%",
                  bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
                  transform: "translateX(-50%)",
                  visibility: cardVisible ? "visible" : "hidden",
              };

    return createPortal(
        <>
            {cardVisible && position && hasTarget ? (
                <div
                    aria-hidden="true"
                    data-testid="tutorial-ring"
                    className="pointer-events-none fixed z-highlight rounded-control ring-2 ring-action/70"
                    style={{
                        left: position.target.left - 4,
                        top: position.target.top - 4,
                        width: position.target.width + 8,
                        height: position.target.height + 8,
                    }}
                />
            ) : null}
            {cardMounted ? (
                <div
                    ref={setCard}
                    role="region"
                    aria-label="Demo tutorial"
                    data-testid="tutorial-hud"
                    data-placement={position?.placement ?? "floating"}
                    data-state={cardVisible ? "shown" : "suspended"}
                    className="m-notice fixed z-notice w-[min(20rem,calc(100vw-1.5rem))] rounded-group border border-action/40 bg-surface p-3 text-ink shadow-[var(--shadow-overlay)]"
                    style={cardStyle}
                    onKeyDown={onCardKeyDown}
                >
                    <div className="flex items-start gap-2">
                        <Sparkles
                            className="mt-0.5 size-4 shrink-0 text-action"
                            aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="type-body font-medium">
                                {prompt.instruction}
                            </p>
                            {prompt.progress ? (
                                <p className="mt-0.5 type-meta text-ink-secondary">
                                    {prompt.progress}
                                </p>
                            ) : null}
                        </div>
                        <ExploreRecordingMenu iconOnly />
                        <button
                            type="button"
                            onClick={tutorial.hide}
                            className="m-control shrink-0 rounded-control px-2 py-1 type-meta text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                            Hide
                        </button>
                    </div>
                    {prompt.complete ? (
                        <p className="mt-2 type-meta text-ink-secondary">
                            {prompt.id === "main-complete"
                                ? "The recorded meeting is archived. Practice edits stay in this browser. Both tours are optional."
                                : "Nothing was saved or activated. The recording is unchanged."}
                        </p>
                    ) : null}
                    {prompt.id === "tour-prompt-4" ||
                    prompt.id === "tour-knowledge-4" ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <TourAction onClick={tutorial.endTour}>
                                Finish tour
                            </TourAction>
                            <TourAction onClick={tutorial.backToDemo}>
                                Back to demo
                            </TourAction>
                        </div>
                    ) : prompt.id === "main-complete" ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <TourAction
                                onClick={() => tutorial.startTour("prompt")}
                            >
                                Explore prompt versions
                            </TourAction>
                            <TourAction
                                onClick={() => tutorial.startTour("knowledge")}
                            >
                                Explore knowledge stacks
                            </TourAction>
                            <TourAction onClick={tutorial.hide}>
                                Finish
                            </TourAction>
                        </div>
                    ) : tutorial.activeTour ? (
                        <div className="mt-2 flex justify-end">
                            <TourAction onClick={tutorial.endTour}>
                                End tour
                            </TourAction>
                        </div>
                    ) : null}
                </div>
            ) : null}
            {compactVisible ? <CompactBar /> : null}
            {!tutorial.hidden ? (
                <p
                    className="sr-only"
                    aria-live="polite"
                    data-testid="tutorial-announcement"
                >
                    {prompt.instruction}
                    {prompt.progress ? `, ${prompt.progress}` : ""}
                </p>
            ) : null}
        </>,
        document.body
    );
}

function TourAction({
    onClick,
    children,
}: {
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="m-control rounded-full border border-action/40 px-2.5 py-0.5 type-meta font-medium text-action hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
            {children}
        </button>
    );
}

function CompactBar() {
    const tutorial = useDemoTutorial();

    return (
        <div
            data-testid="tutorial-hud-compact"
            className="fixed z-notice flex items-center gap-1 rounded-full border border-action/40 bg-surface p-1 shadow-[var(--shadow-raised)]"
            style={{
                top: "calc(env(safe-area-inset-top, 0px) + 4.5rem)",
                right: "calc(env(safe-area-inset-right, 0px) + 1rem)",
            }}
        >
            <button
                type="button"
                onClick={tutorial.show}
                aria-expanded={!tutorial.hidden}
                className="m-control inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 type-meta font-medium text-action hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
                <Sparkles className="size-3.5" aria-hidden="true" />
                Show tips
            </button>
            <ExploreRecordingMenu />
        </div>
    );
}

function ExploreRecordingMenu({ iconOnly = false }: { iconOnly?: boolean }) {
    const tutorial = useDemoTutorial();
    const run = useReplayRun();
    const chapters = run.session.chapters;
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const close = () => {
        if (detailsRef.current) detailsRef.current.open = false;
    };

    return (
        <details ref={detailsRef} className="relative shrink-0">
            <summary
                aria-label="Explore recording"
                className={`m-control flex cursor-pointer list-none items-center gap-1 rounded-full type-meta font-medium text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden ${
                    iconOnly ? "p-1" : "px-2 py-1"
                }`}
            >
                <Compass className="size-3.5" aria-hidden="true" />
                {iconOnly ? null : (
                    <>
                        Explore recording
                        <ChevronDown className="size-3" aria-hidden="true" />
                    </>
                )}
            </summary>
            {/*
             * The card can sit near the bottom of a short viewport, so the menu
             * is placed against the viewport rather than the summary. A fixed
             * panel keeps every item reachable at 720px and 390x844.
             */}
            <div
                onClick={close}
                className="fixed right-4 top-32 z-popup max-h-[70vh] w-64 overflow-y-auto rounded-control border border-control bg-surface p-2 shadow-[var(--shadow-overlay)]"
            >
                {chapters.length > 0 ? (
                    <ul className="mb-1 space-y-0.5 border-b border-separator pb-1">
                        {chapters.map((chapter) => (
                            <li key={chapter.chapter_id}>
                                <Link
                                    href={chapterHref(
                                        chapter,
                                        run.session.meeting_id
                                    )}
                                    aria-current={
                                        tutorial.chapterId ===
                                        chapter.chapter_id
                                            ? "page"
                                            : undefined
                                    }
                                    className="m-control block rounded px-2 py-1 type-meta text-ink-secondary hover:bg-surface-raised aria-[current=page]:text-ink"
                                >
                                    {chapter.title}
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : null}
                {tutorial.canResume ? (
                    <button
                        type="button"
                        onClick={() => void tutorial.resume()}
                        className="m-control block w-full rounded px-2 py-1 text-left type-meta text-ink-secondary hover:bg-surface-raised"
                    >
                        Resume current meeting
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={tutorial.restart}
                    className="m-control block w-full rounded px-2 py-1 text-left type-meta text-ink-secondary hover:bg-surface-raised"
                >
                    Restart recording
                </button>
            </div>
        </details>
    );
}
