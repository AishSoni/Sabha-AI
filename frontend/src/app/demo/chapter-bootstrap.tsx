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
    const { session, runGeneration } = useReplayRun();
    const chapterId = useSearchParams().get("chapter");
    /**
     * A chapter entry is identified by the chapter named in the URL and the
     * replay run that owns it. Re-entering the chapter, or resetting the
     * recording, remounts this entry and therefore restores again. Playback
     * inside one entry keeps its receipt and is not forced back to the start.
     */
    const entryKey = `${chapterId ?? "journey"}:${runGeneration}:${session.run_id}`;
    return (
        <ChapterEntry key={entryKey} chapterId={chapterId}>
            {children}
        </ChapterEntry>
    );
}

function ChapterEntry({
    chapterId,
    children,
}: {
    chapterId: string | null;
    children: ReactNode;
}) {
    const { session, checkpoint, goToChapter } = useReplayRun();
    const pathname = usePathname();
    const searchParams = useSearchParams();
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
        (checkpoint === chapter.checkpoint ||
            restored === chapter.chapter_id);
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
                    : "The demo chapter could not be restored.";
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
            ? "This demo package has been retired. Chapters and demo actions are no longer available."
            : error ??
              (chapter
                  ? "This chapter is not available at the requested route or tab."
                  : "That chapter is not part of the pinned demo.");
        return (
            <ReplayFrame title="Demo chapter unavailable">
                <p className="type-body text-ink-secondary">{reason}</p>
                <p className="type-meta text-ink-muted">
                    The URL cannot select a live screen, another meeting, or an
                    arbitrary checkpoint. Choose a safe recovery destination.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/demo"
                        className="m-control inline-flex min-h-10 items-center rounded-control bg-action px-4 type-control font-medium text-action-foreground hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        Open the demo board
                    </Link>
                    <button
                        type="button"
                        onClick={() => setAttempt((value) => value + 1)}
                        className="m-control inline-flex min-h-10 items-center rounded-control border border-control bg-surface px-4 type-control text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        Try this chapter again
                    </button>
                </div>
            </ReplayFrame>
        );
    }

    if (chapterId !== null && !installed) {
        return (
            <ReplayFrame title="Restoring demo chapter">
                <p className="type-body text-ink-secondary">
                    Installing the approved snapshot before opening the room.
                </p>
            </ReplayFrame>
        );
    }

    return <>{children}</>;
}
