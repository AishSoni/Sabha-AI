"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MeetingRoom } from "@/features/meetings/components/MeetingRoom";
import { RecordedDocumentsPanel } from "@/features/meetings/runtime/recorded-documents-panel";
import { EvidenceTrigger } from "@/features/meetings/evidence/trigger";
import { descriptorForAsset } from "@/features/meetings/runtime/replay-evidence";
import { useReplaySessionReady } from "@/features/meetings/runtime/replay-session";
import { DemoMeetingDocuments } from "@/features/knowledge/local";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import { chapterHref } from "@/features/meetings/runtime/chapters";

function DemoAddedDocuments({ meetingId }: { meetingId: string }) {
    const { session } = useReplaySessionReady();
    const assetsById = useMemo(
        () => new Map(session.assets.map((asset) => [asset.asset_id, asset])),
        [session.assets]
    );
    return (
        <DemoMeetingDocuments
            meetingId={meetingId}
            mode="room"
            renderPreviewAction={(sample) => {
                const asset = assetsById.get(sample.assetId);
                if (!asset) return null;
                return (
                    <EvidenceTrigger
                        descriptor={{
                            ...descriptorForAsset(asset),
                            title: sample.fileName,
                        }}
                        label="Preview source"
                    />
                );
            }}
        />
    );
}

function DemoDocumentsPanel({ meetingId }: { meetingId: string }) {
    return (
        <RecordedDocumentsPanel
            meetingId={meetingId}
            addedDocuments={DemoAddedDocuments}
        />
    );
}

/**
 * The canonical recorded meeting route (spec-18). Unknown or local IDs
 * redirect before any replay read.
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
            <main id="main-content" className="mx-auto max-w-3xl px-4 py-12 text-ink" tabIndex={-1}>
                <p className="type-body text-ink-secondary">
                    This demo has not reached the meeting room yet. Returning to the
                    demo board…
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
            documentPanel={DemoDocumentsPanel}
        />
    );
}
