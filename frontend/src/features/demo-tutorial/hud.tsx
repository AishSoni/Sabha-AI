"use client";

/**
 * The single tutorial HUD (spec-29).
 *
 * One instruction, anchored to the real control. The card never intercepts
 * pointer events outside itself, never moves focus and never advances the
 * journey. A missing or clipped anchor collapses it to the compact bar.
 */
import {
    useMemo,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import {
    getAnchor,
    useAnchorCandidates,
    useAnchorVersion,
} from "./anchors";
import type { TutorialAnchorId } from "./contract";
import { ExploreRecordingMenu } from "./explore-menu";
import { TutorialGuide } from "./guide";
import { useDemoTutorial } from "./provider";
import { useModalOpen, useTutorialStreaming } from "./presence";
import { tutorialProgress } from "./progress";
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
    const anchorVersion = useAnchorVersion();
    const avoid = useMemo(() => {
        // The version is read so a newly mounted control invalidates the
        // obstacle list even when the prompt id stays the same.
        void anchorVersion;
        // Only the controls the current instruction could sit on top of are
        // hard obstacles. Avoiding every registered anchor makes the card
        // impossible to place in the populated room.
        const critical: TutorialAnchorId[] = [
            "room.speaker",
            "room.followup",
        ];
        const anchors = critical
            .filter((id) => id !== match?.id)
            .map((id) => getAnchor(id))
            .filter((element): element is HTMLElement => Boolean(element));
        if (typeof document === "undefined") return anchors;

        const room = document.querySelector('[data-testid="room-work-area"]');
        const dock = document.querySelector('[data-testid="room-dock"]');
        const flagged = room
            ? Array.from(
                  room.querySelectorAll<HTMLElement>("[data-tutorial-avoid]")
              )
            : [];
        return [
            ...anchors,
            ...flagged,
            ...(dock instanceof HTMLElement ? [dock] : []),
        ];
    }, [match?.id, anchorVersion]);
    const position = useAnchoredCard(
        prompt?.anchor ? (match?.element ?? null) : null,
        card,
        { avoid }
    );

    const hasTarget = Boolean(prompt?.anchor);
    const anchored = !hasTarget || match !== null;
    const suspended = modalOpen || streaming;
    const inlineRoom =
        (prompt?.id === "main-speaker" || prompt?.id === "main-followup") &&
        match !== null;
    // A real target keeps the instruction visible even when the floating card
    // cannot be placed beside it: fall back to a fixed reading position rather
    // than hiding the current objective behind the compact bar.
    const cardVisible =
        !inlineRoom && !tutorial.hidden && !suspended && anchored;
    const compactVisible =
        !suspended && (tutorial.hidden || (!inlineRoom && !anchored));
    const cardMounted = !inlineRoom && !tutorial.hidden && !suspended && anchored;
    const inlineTarget =
        inlineRoom && match
            ? (() => {
                  const rect = match.element.getBoundingClientRect();
                  return {
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                  };
              })()
            : null;
    const ringTarget = position?.target ?? inlineTarget;
    const ringVisible =
        !tutorial.hidden &&
        !suspended &&
        anchored &&
        hasTarget &&
        Boolean(ringTarget) &&
        (cardVisible || inlineRoom);

    if (!mounted || !prompt) return null;

    const progress = tutorialProgress(prompt, tutorial.journey);

    const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            tutorial.hide();
        }
    };

    const cardStyle: CSSProperties =
        position && hasTarget && position.visible
            ? {
                  left: position.x,
                  top: position.y,
                  visibility: "visible",
              }
            : position && hasTarget
              ? {
                    left: "50%",
                    top: "calc(env(safe-area-inset-top, 0px) + 4.5rem)",
                    transform: "translateX(-50%)",
                    width: "min(20rem, calc(100vw - 2rem))",
                    visibility: "visible",
                }
              : {
                    left: "50%",
                    bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
                    transform: "translateX(-50%)",
                    visibility: cardVisible ? "visible" : "hidden",
                };

    return createPortal(
        <>
            {ringVisible && ringTarget ? (
                <div
                    aria-hidden="true"
                    data-testid="tutorial-ring"
                    className="pointer-events-none fixed z-highlight rounded-control ring-2 ring-focus-ring outline outline-1 outline-action/60"
                    style={{
                        left: ringTarget.left - 4,
                        top: ringTarget.top - 4,
                        width: ringTarget.width + 8,
                        height: ringTarget.height + 8,
                    }}
                />
            ) : null}
            {cardMounted ? (
                <div
                    ref={setCard}
                    data-state={cardVisible ? "shown" : "suspended"}
                    className="fixed z-notice w-[min(20rem,calc(100vw-1.5rem))]"
                    style={cardStyle}
                    onKeyDown={onCardKeyDown}
                >
                    <TutorialGuide
                        prompt={prompt}
                        progress={progress}
                        placement="card"
                    />
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

function CompactBar() {
    const tutorial = useDemoTutorial();

    return (
        <div
            data-testid="tutorial-hud-compact"
            className="material-raised fixed z-notice flex items-center gap-1 rounded-full border border-separator p-1"
            style={{
                top: "calc(env(safe-area-inset-top, 0px) + 4.5rem)",
                left: "calc(env(safe-area-inset-left, 0px) + 1rem)",
            }}
        >
            <button
                type="button"
                onClick={tutorial.show}
                aria-expanded={!tutorial.hidden}
                className="m-control inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 py-1 type-meta font-medium text-action hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
                <Sparkles className="size-4" aria-hidden="true" />
                Show tips
            </button>
            <ExploreRecordingMenu />
        </div>
    );
}


