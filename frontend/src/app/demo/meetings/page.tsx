"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, Ban, MessageSquare, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRuntimeMeetingList } from "@/features/meetings/runtime/hooks";
import { useActiveReplayIntentId } from "@/features/meetings/runtime/active-intent";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";

type ListTab = "active" | "archived";

export default function DemoMeetingListPage() {
    const run = useReplayRun();
    const activeIntentId = useActiveReplayIntentId();
    const meetings = useRuntimeMeetingList();
    const [tab, setTab] = useState<ListTab>("active");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const archiveIntent = useMemo(
        () => run.session.intents.find((item) => item.kind === "archive_meeting"),
        [run.session.intents]
    );
    const canArchive = activeIntentId === archiveIntent?.intent_id;

    const list = meetings.data ?? [];
    const active = list.filter((meeting) => meeting.status !== "archived");
    const archived = list.filter((meeting) => meeting.status === "archived");
    // The guide can restore the pre-archive checkpoint without remounting this
    // page. While archive is the active intent, the ended meeting must be
    // visible so the step can be retried.
    const shownTab: ListTab = canArchive ? "active" : tab;
    const shown = shownTab === "active" ? active : archived;

    const archive = async (meetingId: string) => {
        if (!archiveIntent) return;
        setBusy(true);
        setError(null);
        try {
            await run.startIntent(archiveIntent.intent_id);
            setTab("archived");
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "The recorded archive step could not be loaded."
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="mx-auto max-w-5xl px-4 py-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">
                            Guided replay
                        </Badge>
                        <span className="text-xs text-zinc-500">
                            Recorded meeting list
                        </span>
                    </div>
                    <h1 className="text-2xl font-semibold text-white">Meetings</h1>
                    <p className="mt-2 text-sm text-zinc-400">
                        Return to the real meeting list and archive the ended record.
                        Archiving is an overlay; the meeting remains ended.
                    </p>
                </div>
                <Link
                    href="/demo"
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                    Back to the board
                </Link>
            </div>

            <div className="mb-4 inline-flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
                <button
                    type="button"
                    onClick={() => setTab("active")}
                    className={`rounded-md px-4 py-2 text-sm ${
                        shownTab === "active"
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-400 hover:text-white"
                    }`}
                >
                    <MessageSquare className="mr-2 inline h-4 w-4" />
                    Active and ended
                </button>
                <button
                    type="button"
                    onClick={() => setTab("archived")}
                    className={`rounded-md px-4 py-2 text-sm ${
                        shownTab === "archived"
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-400 hover:text-white"
                    }`}
                >
                    <Archive className="mr-2 inline h-4 w-4" />
                    Archived
                </button>
            </div>

            {error ? (
                <p className="mb-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
                    {error}
                </p>
            ) : null}

            {meetings.isLoading ? (
                <p className="text-sm text-zinc-500">Loading recorded meetings…</p>
            ) : meetings.error ? (
                <p className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-300">
                    {meetings.error.message}
                </p>
            ) : shown.length === 0 ? (
                <Card className="border-zinc-800 bg-zinc-900/40 p-10 text-center">
                    <Users className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                    <p className="text-sm text-zinc-400">
                        {shownTab === "active"
                            ? "No active or ended recorded meeting yet."
                            : "No archived recorded meeting yet."}
                    </p>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {shown.map((meeting) => {
                        const isArchived = meeting.status === "archived";
                        const isEnded =
                            meeting.status === "ended" || isArchived;
                        return (
                            <Card
                                key={meeting.id}
                                className="border-zinc-800 bg-zinc-900/50 p-5"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h2 className="font-medium text-white">
                                            {meeting.name}
                                        </h2>
                                        <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                                            {meeting.agenda}
                                        </p>
                                    </div>
                                    <Badge
                                        variant="secondary"
                                        className={
                                            isArchived
                                                ? "bg-zinc-700 text-zinc-300"
                                                : isEnded
                                                  ? "bg-amber-900/60 text-amber-200"
                                                  : "bg-emerald-900/60 text-emerald-200"
                                        }
                                    >
                                        {isArchived
                                            ? "Archived"
                                            : isEnded
                                              ? "Ended"
                                              : "Active"}
                                    </Badge>
                                </div>
                                <p className="mt-3 text-xs text-zinc-500">
                                    {new Date(meeting.created_at).toLocaleDateString()}
                                </p>
                                {isArchived ? (
                                    <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 text-xs text-zinc-400">
                                        Archived overlay recorded. The underlying meeting
                                        remains ended; this replay does not reopen it.
                                    </p>
                                ) : null}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Link
                                        href={`/demo/meetings/${meeting.id}`}
                                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                                    >
                                        Open record
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                    {isEnded && !isArchived ? (
                                        <Button
                                            size="sm"
                                            data-testid="archive-meeting"
                                            className="bg-indigo-600 hover:bg-indigo-700"
                                            disabled={!canArchive || busy}
                                            onClick={() => void archive(meeting.id)}
                                            title={
                                                canArchive
                                                    ? "Archive the recorded meeting"
                                                    : "This action is only available in the archive step"
                                            }
                                        >
                                            <Archive className="mr-2 h-4 w-4" />
                                            Archive
                                        </Button>
                                    ) : null}
                                    <span className="inline-flex items-center gap-1 px-2 py-2 text-xs text-zinc-600">
                                        <Ban className="h-3.5 w-3.5" />
                                        Unarchive and delete are unavailable in guided replay
                                    </span>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
