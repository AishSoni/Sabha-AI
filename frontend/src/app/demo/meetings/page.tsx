"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, MessageSquare, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { useLocalPracticeMeetings } from "@/features/knowledge/local";
import { useRuntimeMeetingList } from "@/features/meetings/runtime/hooks";
import { useActiveReplayIntentId } from "@/features/meetings/runtime/active-intent";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";

type ListTab = "active" | "archived";

export default function DemoMeetingListPage() {
    const run = useReplayRun();
    const workspace = useDemoWorkspace();
    const practice = useLocalPracticeMeetings();
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

    const archive = async () => {
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
                            Prepared demo
                        </Badge>
                        <span className="text-xs text-zinc-500">
                            Recorded meeting list
                        </span>
                    </div>
                    <h1 className="text-2xl font-semibold text-white">Meetings</h1>
                    <p className="mt-2 text-sm text-zinc-400">
                        Open the recorded meeting or archive the ended record.
                    </p>
                </div>
                <Link
                    href="/demo"
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                    Back to the board
                </Link>
            </div>

            {workspace.expanded ? (
                <section className="mb-8" aria-labelledby="practice-setups">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h2
                                id="practice-setups"
                                className="text-lg font-semibold text-white"
                            >
                                Practice setups
                            </h2>
                            <p className="mt-1 text-sm text-zinc-400">
                                Temporary browser-memory setups you created by
                                editing the prepared intake. They are separate
                                from the recorded meeting below.
                            </p>
                        </div>
                        <Badge
                            variant="secondary"
                            className="bg-amber-900/60 text-amber-200"
                        >
                            Local only
                        </Badge>
                    </div>
                    {practice.meetings.length === 0 ? (
                        <Card className="border-dashed border-zinc-800 bg-zinc-900/30 p-5 text-sm text-zinc-500">
                            No practice setup in this tab. Open{" "}
                            <Link
                                href="/demo/new"
                                className="text-cyan-400 hover:text-cyan-300"
                            >
                                New meeting
                            </Link>{" "}
                            and choose <strong>Try editing this setup</strong>{" "}
                            to practice creating one.
                        </Card>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                            {practice.meetings.map((meeting) => (
                                <Card
                                    key={meeting.meetingId}
                                    className="border-zinc-800 bg-zinc-900/50 p-4"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h3 className="font-medium text-white">
                                                {meeting.name}
                                            </h3>
                                            <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                                                {meeting.agenda ||
                                                    "No additional context"}
                                            </p>
                                        </div>
                                        <Badge
                                            variant="secondary"
                                            className="bg-amber-900/60 text-amber-200"
                                        >
                                            Practice
                                        </Badge>
                                    </div>
                                    <p className="mt-2 text-xs text-zinc-500">
                                        {meeting.participants.length}{" "}
                                        participant
                                        {meeting.participants.length === 1
                                            ? ""
                                            : "s"}{" "}
                                        · {meeting.sampleIds.length} prepared
                                        sample
                                        {meeting.sampleIds.length === 1
                                            ? ""
                                            : "s"}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Link
                                            href={`/demo/meetings/${meeting.meetingId}`}
                                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                                        >
                                            Open practice setup
                                            <ArrowRight className="h-4 w-4" />
                                        </Link>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="text-red-300 hover:text-red-200"
                                            onClick={() => {
                                                const confirmed =
                                                    window.confirm(
                                                        `Discard "${meeting.name}"? Its local documents and simulated operations will be revoked. The recorded meeting, transcript, and Files view are unchanged.`
                                                    );
                                                if (confirmed) {
                                                    practice.discardMeeting(
                                                        meeting.meetingId
                                                    );
                                                }
                                            }}
                                        >
                                            Discard setup
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </section>
            ) : null}

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
                                            onClick={() => void archive()}
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
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
