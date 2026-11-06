"use client";

/**
 * The tutorial ring and live announcement (spec-29).
 *
 * Instructions themselves render in flow: the reserved shell rail on ordinary
 * demo routes and the room dock on a meeting. This layer only highlights the
 * real control and announces objective changes; it never covers the page.
 */
import {
    useCallback,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Compass } from "lucide-react";
import { chapterHref, useReplayRun } from "@/features/meetings/presentation";
import { useAnchorCandidates } from "./anchors";
import type { TutorialAnchorId } from "./contract";
import { useDemoTutorial } from "./provider";
import { useModalOpen, useTutorialStreaming } from "./presence";

const emptySubscribe = () => () => {};

/** Client-only render without an effect, so server markup stays empty. */
function useMounted(): boolean {
    return useSyncExternalStore(
        emptySubscribe,
        () => true,
        () => false
    );
}

interface AnchorRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

function useAnchorRect(element: HTMLElement | null): AnchorRect | null {
    const subscribe = useCallback(
        (onChange: () => void) => {
            if (!element) return () => {};
            const measure = () => onChange();
            window.addEventListener("scroll", measure, true);
            window.addEventListener("resize", measure);
            const observer =
                typeof ResizeObserver === "undefined"
                    ? null
                    : new ResizeObserver(measure);
            observer?.observe(element);
            return () => {
                window.removeEventListener("scroll", measure, true);
                window.removeEventListener("resize", measure);
                observer?.disconnect();
            };
        },
        [element]
    );
    const getSnapshot = useCallback(() => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return `${rect.left}:${rect.top}:${rect.width}:${rect.height}`;
    }, [element]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);

    if (!snapshot) return null;
    const [left, top, width, height] = snapshot.split(":").map(Number);
    return { left, top, width, height };
}

export function TutorialHud() {
    const tutorial = useDemoTutorial();
    const mounted = useMounted();
    const modalOpen = useModalOpen();
    const streaming = useTutorialStreaming();

    const prompt = tutorial.prompt;
    const candidates: TutorialAnchorId[] = prompt
        ? ([prompt.anchor, ...(prompt.alternates ?? [])].filter(
              Boolean
          ) as TutorialAnchorId[])
        : [];
    const match = useAnchorCandidates(candidates);
    const rect = useAnchorRect(prompt?.anchor ? (match?.element ?? null) : null);

    if (!mounted || !prompt) return null;

    const ringVisible =
        !tutorial.hidden &&
        !modalOpen &&
        !streaming &&
        Boolean(prompt.anchor) &&
        rect !== null;

    return createPortal(
        <>
            {ringVisible && rect ? (
                <div
                    aria-hidden="true"
                    data-testid="tutorial-ring"
                    className="pointer-events-none fixed z-highlight rounded-control ring-2 ring-action/70"
                    style={{
                        left: rect.left - 4,
                        top: rect.top - 4,
                        width: rect.width + 8,
                        height: rect.height + 8,
                    }}
                />
            ) : null}
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

export function ExploreRecordingMenu({ iconOnly = false }: { iconOnly?: boolean }) {
    const tutorial = useDemoTutorial();
    const run = useReplayRun();
    const chapters = run.session.chapters;
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const [open, setOpen] = useState(false);
    const close = () => {
        if (detailsRef.current) detailsRef.current.open = false;
        setOpen(false);
    };

    return (
        <details
            ref={detailsRef}
            className="relative shrink-0"
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary
                aria-label="Explore recording"
                className={`m-control flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-full type-meta font-medium text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden ${
                    iconOnly ? "min-w-8 justify-center p-1" : "px-2 py-1"
                }`}
            >
                <Compass className="size-4" aria-hidden="true" />
                {iconOnly ? null : (
                    <>
                        Explore recording
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                    </>
                )}
            </summary>
            {open
                ? createPortal(
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
                      </div>,
                      document.body
                  )
                : null}
        </details>
    );
}
