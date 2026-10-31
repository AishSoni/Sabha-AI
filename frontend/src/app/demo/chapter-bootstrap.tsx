"use client";

/**
 * Pinned chapter entry (spec-26).
 *
 * A URL names an approved chapter, never a checkpoint. The chapter is looked
 * up in the pinned package and its checkpoint is installed before the room is
 * mounted. Unknown chapters, mismatched routes, retired packages, and tabs
 * that widen the chapter all fail closed with an explicit recovery choice.
 */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import { ReplayFrame } from "@/features/meetings/runtime/replay-session";
import {
    chapterPathMatches,
    chapterTab,
} from "@/features/meetings/runtime/chapters";

const retryDelayMs = 40;

export function ChapterBootstrap({ children }: { children: ReactNode }) {
    const run = useReplayRun();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const chapterId = searchParams.get("chapter");
    const requestedTab = searchParams.get("tab");
    const [ready, setReady] = useState(chapterId === null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    const chapter = chapterId
        ? run.session.chapters.find((item) => item.chapter_id === chapterId) ??
          null
        : null;
    const tab = chapter ? chapterTab(chapter, requestedTab) : null;
    const invalid =
        chapterId !== null &&
        (!chapter ||
            tab === null ||
            run.session.retired ||
            !chapterPathMatches(chapter, run.session.meeting_id, pathname));

    useEffect(() => {
        setError(null);
        if (chapterId === null) {
            setReady(true);
            return;
        }
        if (invalid || !chapter) {
            setReady(false);
            return;
        }
        if (run.checkpoint === chapter.checkpoint) {
            setReady(true);
            return;
        }

        const controller = new AbortController();
        let cancelled = false;
        setReady(false);
        run.goToChapter(chapter.chapter_id, {
            signal: controller.signal,
        }).then(
            () => {
                if (!cancelled) setReady(true);
            },
            (cause: unknown) => {
                if (cancelled || controller.signal.aborted) return;
                const message =
                    cause instanceof Error
                        ? cause.message
                        : "The recorded chapter could not be restored.";
                if (message.includes("already in progress")) {
                    // A previous navigation is still settling. Retrying after
                    // it finishes lets the latest URL win without exposing a
                    // transient failure to the visitor.
                    window.setTimeout(() => {
                        if (!cancelled) setAttempt((value) => value + 1);
                    }, retryDelayMs);
                    return;
                }
                setReady(false);
                setError(message);
            }
        );

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [
        attempt,
        chapter,
        chapterId,
        invalid,
        pathname,
        run.checkpoint,
        run.goToChapter,
        run.session.meeting_id,
        run.session.retired,
    ]);

    if (invalid || error) {
        const reason = run.session.retired
            ? "This recorded package has been retired. Chapters and prepared actions are no longer available."
            : error ??
              (chapter
                  ? "This chapter is not available at the requested route or tab."
                  : "That chapter is not part of the pinned recording.");
        return (
            <ReplayFrame title="Recorded chapter unavailable">
                <p className="text-sm text-zinc-400">{reason}</p>
                <p className="text-xs text-zinc-500">
                    The URL cannot select a live screen, another meeting, or an
                    arbitrary checkpoint. Choose a safe recovery destination.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/demo"
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                    >
                        Open the recorded board
                    </Link>
                    <button
                        type="button"
                        onClick={() => setAttempt((value) => value + 1)}
                        className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                        Try this chapter again
                    </button>
                </div>
            </ReplayFrame>
        );
    }

    if (!ready) {
        return (
            <ReplayFrame title="Restoring recorded chapter">
                <p className="text-sm text-zinc-400">
                    Installing the approved snapshot before opening the room.
                </p>
            </ReplayFrame>
        );
    }

    return <>{children}</>;
}
