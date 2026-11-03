"use client";

/**
 * The single tutorial HUD (spec-29).
 *
 * One instruction, anchored to the real control. The card never intercepts
 * pointer events outside itself, never moves focus and never advances the
 * journey. A missing or clipped anchor collapses it to the compact bar.
 */
import {
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Compass, Sparkles } from "lucide-react";
import { chapterHref } from "@/features/meetings/runtime/chapters";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
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
                    className="pointer-events-none fixed z-30 rounded-lg ring-2 ring-indigo-400/70"
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
                    className="fixed z-40 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-indigo-500/40 bg-zinc-900/95 p-3 text-zinc-100 shadow-xl"
                    style={cardStyle}
                    onKeyDown={onCardKeyDown}
                >
                    <div className="flex items-start gap-2">
                        <Sparkles
                            className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300"
                            aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug">
                                {prompt.instruction}
                            </p>
                            {prompt.progress ? (
                                <p className="mt-0.5 text-xs text-zinc-400">
                                    {prompt.progress}
                                </p>
                            ) : null}
                        </div>
                        <ExploreRecordingMenu iconOnly />
                        <button
                            type="button"
                            onClick={tutorial.hide}
                            className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                            Hide
                        </button>
                    </div>
                    {prompt.complete ? (
                        <p className="mt-2 text-xs text-zinc-400">
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
            className="rounded-full border border-indigo-500/40 px-2.5 py-0.5 text-xs font-medium text-indigo-200 hover:bg-indigo-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
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
            className="fixed z-40 flex items-center gap-1 rounded-full border border-indigo-500/40 bg-zinc-950/95 p-1 shadow-lg"
            style={{
                top: "calc(env(safe-area-inset-top, 0px) + 4.5rem)",
                right: "calc(env(safe-area-inset-right, 0px) + 1rem)",
            }}
        >
            <button
                type="button"
                onClick={tutorial.show}
                aria-expanded={!tutorial.hidden}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-indigo-200 hover:bg-indigo-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
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

    return (
        <details className="relative shrink-0">
            <summary
                aria-label="Explore recording"
                className={`flex cursor-pointer list-none items-center gap-1 rounded-full text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 [&::-webkit-details-marker]:hidden ${
                    iconOnly ? "p-1" : "px-2 py-1"
                }`}
            >
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                {iconOnly ? null : (
                    <>
                        Explore recording
                        <ChevronDown className="h-3 w-3" aria-hidden="true" />
                    </>
                )}
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-zinc-700 bg-zinc-950 p-2 shadow-xl">
                {chapters.length > 0 ? (
                    <ul className="mb-1 space-y-0.5 border-b border-zinc-800 pb-1">
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
                                    className="block rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 aria-[current=page]:text-white"
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
                        className="block w-full rounded px-2 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                        Resume current meeting
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={tutorial.restart}
                    className="block w-full rounded px-2 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                >
                    Restart recording
                </button>
            </div>
        </details>
    );
}
