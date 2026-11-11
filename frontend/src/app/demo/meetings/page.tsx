"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRuntimeMeetingList } from "@/features/meetings/runtime/hooks";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import { useAnchorRef } from "@/features/demo-tutorial";

type ListTab = "active" | "archived";

export default function DemoMeetingListPage() {
    const run = useReplayRun();
    const archiveRef = useAnchorRef("meetings.archive");
    const listRef = useAnchorRef("meetings.list");
    const meetings = useRuntimeMeetingList();
    const [tab, setTab] = useState<ListTab>("active");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const archiveIntent = useMemo(
        () => run.session.intents.find((item) => item.kind === "archive_meeting"),
        [run.session.intents]
    );
    const replay = run.runtime.replay;
    const deckArchive = Boolean(replay?.preparedTurns?.length);
    const canArchive = deckArchive || Boolean(archiveIntent);

    const list = meetings.data ?? [];
    const active = list.filter((meeting) => meeting.status !== "archived");
    const archived = list.filter((meeting) => meeting.status === "archived");
    const shownTab: ListTab = tab;
    const shown = shownTab === "active" ? active : archived;

    const archive = async () => {
        setBusy(true);
        setError(null);
        try {
            if (deckArchive && replay) {
                await replay.archivePreparedMeeting();
            } else if (archiveIntent) {
                await run.startIntent(archiveIntent.intent_id);
            } else {
                throw new Error("This demo has no archive step.");
            }
            await meetings.refetch();
            setTab("archived");
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "The demo archive step could not be loaded."
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <main id="main-content" className="mx-auto max-w-5xl px-4 py-8" tabIndex={-1}>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge>Demo</Badge>
                        <span className="text-xs text-ink-muted">
                            Meeting list
                        </span>
                    </div>
                    <h1 className="text-2xl font-semibold text-ink">Meetings</h1>
                    <p className="mt-2 text-sm text-ink-secondary">
                        Open the meeting or archive the ended record.
                    </p>
                </div>
                <Link
                    href="/demo"
                    className="m-control inline-flex items-center gap-2 rounded-control border border-control bg-surface px-4 py-2 type-control text-ink hover:bg-surface-raised"
                >
                    Back to the board
                </Link>
            </div>

            <div
                ref={listRef}
                className="mb-4 inline-flex rounded-group border border-separator bg-surface-raised p-1"
            >
                <button
                    type="button"
                    onClick={() => setTab("active")}
                    aria-pressed={shownTab === "active"}
                    className={`m-control rounded-control px-4 py-2 type-control ${
                        shownTab === "active"
                            ? "bg-surface-selected text-ink"
                            : "text-ink-secondary hover:text-ink"
                    }`}
                >
                    <MessageSquare className="mr-2 inline h-4 w-4" />
                    Active and ended
                </button>
                <button
                    type="button"
                    onClick={() => setTab("archived")}
                    aria-pressed={shownTab === "archived"}
                    className={`m-control rounded-control px-4 py-2 type-control ${
                        shownTab === "archived"
                            ? "bg-surface-selected text-ink"
                            : "text-ink-secondary hover:text-ink"
                    }`}
                >
                    <Archive className="mr-2 inline h-4 w-4" />
                    Archived
                </button>
            </div>

            {error ? (
                <p role="alert" className="mb-4 rounded-group border border-danger/60 bg-danger-soft p-3 type-body text-danger">
                    {error}
                </p>
            ) : null}

            {meetings.isLoading ? (
                <p role="status" className="type-body text-ink-muted">Loading demo meetings…</p>
            ) : meetings.error ? (
                <p role="alert" className="rounded-group border border-warning/60 bg-warning-soft p-3 type-body text-warning">
                    {meetings.error.message}
                </p>
            ) : shown.length === 0 ? (
                <div className="rounded-group border border-dashed border-separator px-5 py-6">
                    <p className="type-body text-ink-secondary">
                        {shownTab === "active"
                            ? "No active or ended demo meeting yet."
                            : "No archived demo meeting yet."}
                    </p>
                    <p className="mt-1 type-meta text-ink-muted">
                        {shownTab === "active"
                            ? "Create the prepared meeting from the board to open its room."
                            : "Archived meetings stay listed here without changing the recorded content."}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {shown.map((meeting) => {
                        const isArchived = meeting.status === "archived";
                        const isEnded =
                            meeting.status === "ended" || isArchived;
                        return (
                            <Card key={meeting.id} className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h2 className="type-item-title text-ink">
                                            {meeting.name}
                                        </h2>
                                        <p className="mt-1 line-clamp-2 type-body text-ink-muted">
                                            {meeting.agenda}
                                        </p>
                                    </div>
                                    <StatusBadge
                                        tone={
                                            isArchived
                                                ? "neutral"
                                                : isEnded
                                                  ? "warning"
                                                  : "success"
                                        }
                                    >
                                        {isArchived
                                            ? "Archived"
                                            : isEnded
                                              ? "Ended"
                                              : "Active"}
                                    </StatusBadge>
                                </div>
                                <p className="mt-3 text-xs text-ink-muted">
                                    {new Date(meeting.created_at).toLocaleDateString()}
                                </p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Link
                                        href={`/demo/meetings/${meeting.id}`}
                                        className="m-control inline-flex items-center gap-2 rounded-control border border-control bg-surface px-3 py-2 type-control text-ink hover:bg-surface-raised"
                                    >
                                        Open meeting
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                    {isEnded && !isArchived ? (
                                        <Button
                                            ref={archiveRef}
                                            size="sm"
                                            data-testid="archive-meeting"
                                            busy={busy}
                                            busyLabel="Archiving"
                                            disabled={!canArchive}
                                            onClick={() => void archive()}
                                            title={
                                                canArchive
                                                    ? "Archive the demo meeting"
                                                    : "This demo has no archive step"
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
