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

type Failure = {
    chapterId: string;
    attempt: number;
    message: string;
};

export function ChapterBootstrap({ children }: { children: ReactNode }) {
    const { session, checkpoint, goToChapter } = useReplayRun();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const chapterId = searchParams.get("chapter");
    const requestedTab = searchParams.get("tab");
    const [attempt, setAttempt] = useState(0);
    const [failure, setFailure] = useState<Failure | null>(null);
    const [restored, setRestored] = useState<string | null>(null);

    const chapter = chapterId
        ? session.chapters.find((item) => item.chapter_id === chapterId) ?? null
        : null;
    const tab = chapter ? chapterTab(chapter, requestedTab) : null;
    const invalid =
        chapterId !== null &&
        (!chapter ||
            tab === null ||
            session.retired ||
            !chapterPathMatches(chapter, session.meeting_id, pathname));
    const installed =
        chapter !== null &&
        (checkpoint === chapter.checkpoint || restored === chapter.chapter_id);
    const error =
        failure &&
        failure.chapterId === chapterId &&
        failure.attempt === attempt
            ? failure.message
            : null;

    useEffect(() => {
        if (chapterId === null || invalid || !chapter || installed) return;

        const controller = new AbortController();
        let cancelled = false;
        goToChapter(chapter.chapter_id, {
            signal: controller.signal,
        })
            .then(() => {
                if (!cancelled && !controller.signal.aborted) {
                    setRestored(chapter.chapter_id);
                }
            })
            .catch((cause: unknown) => {
            if (cancelled || controller.signal.aborted) return;
            const message =
                cause instanceof Error
                    ? cause.message
                    : "The recorded chapter could not be restored.";
            if (message.includes("already in progress")) {
                // A previous navigation is still settling. Retrying after it
                // finishes lets the latest URL win without exposing a
                // transient failure to the visitor.
                window.setTimeout(() => {
                    if (!cancelled) setAttempt((value) => value + 1);
                }, retryDelayMs);
                return;
            }
            setFailure({ chapterId, attempt, message });
        });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [
        attempt,
        chapter,
        chapterId,
        goToChapter,
        installed,
        invalid,
        session.meeting_id,
        session.retired,
    ]);

    if (invalid || error) {
        const reason = session.retired
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

    if (chapterId !== null && !installed) {
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
