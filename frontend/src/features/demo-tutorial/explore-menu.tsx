"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Compass } from "lucide-react";
import { chapterHref, useReplayRun } from "@/features/meetings/presentation";
import { useDemoTutorial } from "./provider";

/**
 * The single guide menu shared by the floating card, the room strip and the
 * compact bar. Hiding the tips lives here so every presentation exposes the
 * same action in the same place.
 */
export function ExploreRecordingMenu({
    iconOnly = false,
}: {
    iconOnly?: boolean;
}) {
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
                aria-label="Explore demo"
                className={`m-control flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-full type-meta font-medium text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden ${
                    iconOnly ? "min-w-8 justify-center p-1" : "px-2 py-1"
                }`}
            >
                <Compass className="size-4" aria-hidden="true" />
                {iconOnly ? null : (
                    <>
                        Explore demo
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                    </>
                )}
            </summary>
            {/*
             * The card can sit near the bottom of a short viewport and its
             * floating position uses a transform, which would make a fixed
             * child relative to the card. Portal the panel so it is measured
             * against the viewport and every item stays reachable at 720px
             * and 390x844.
             */}
            {open
                ? createPortal(
                      <div
                          onClick={close}
                          className="material-panel fixed right-4 top-32 z-popup max-h-[70vh] w-64 overflow-y-auto rounded-control border-control p-2"
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
                              Restart demo
                          </button>
                          {!tutorial.hidden ? (
                              <div className="mt-1 border-t border-separator pt-1">
                                  <button
                                      type="button"
                                      onClick={() => {
                                          close();
                                          tutorial.hide();
                                      }}
                                      className="m-control block w-full rounded px-2 py-1 text-left type-meta text-ink-secondary hover:bg-surface-raised"
                                  >
                                      Hide
                                  </button>
                              </div>
                          ) : null}
                      </div>,
                      document.body
                  )
                : null}
        </details>
    );
}
