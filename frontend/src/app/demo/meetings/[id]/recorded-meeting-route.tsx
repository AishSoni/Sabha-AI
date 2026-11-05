"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MeetingRoom } from "@/features/meetings/components/MeetingRoom";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import { chapterHref } from "@/features/meetings/runtime/chapters";

/**
 * The canonical recorded meeting route (spec-18). Local practice IDs never
 * reach this component; the route branches before replay state is read.
 */
export function RecordedMeetingRoute({ meetingId }: { meetingId: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const run = useReplayRun();
    const chapterId = searchParams.get("chapter");
    const chapter = chapterId
        ? (run.session.chapters.find(
              (item) => item.chapter_id === chapterId
          ) ?? null)
        : null;
    /**
     * A chapter's approved tab is part of that chapter record. The room always
     * opens on it even if the URL omitted the tab, while an explicit mismatched
     * tab remains a bootstrap failure.
     */
    const selectedTab =
        chapter?.tab ?? searchParams.get("tab") ?? "chat";
    const notCreated =
        run.checkpoint === run.session.initial_checkpoint ||
        run.session.meeting_id !== meetingId;

    useEffect(() => {
        if (notCreated) {
            router.replace("/demo");
        }
    }, [notCreated, router]);

    useEffect(() => {
        if (chapter && !searchParams.get("tab")) {
            router.replace(chapterHref(chapter, run.session.meeting_id));
        }
    }, [chapter, router, run.session.meeting_id, searchParams]);

    const changeTab = useCallback(
        (nextTab: string) => {
            const next = new URLSearchParams(searchParams.toString());
            next.set("tab", nextTab);
            // Choosing another tab explicitly leaves chapter inspection; the
            // recorded checkpoint and canonical progress stay untouched.
            next.delete("chapter");
            router.replace(`${pathname}?${next.toString()}`);
        },
        [pathname, router, searchParams]
    );

    if (notCreated) {
        return (
            <main className="mx-auto max-w-3xl px-4 py-12 text-ink">
                <p className="type-body text-ink-secondary">
                    This replay has not reached the meeting room yet. Returning to the
                    prepared board…
                </p>
            </main>
        );
    }

    return (
        <MeetingRoom
            meetingId={meetingId}
            initialTab={selectedTab}
            activeTab={selectedTab}
            onTabChange={changeTab}
        />
    );
}
