"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, MessageSquare, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDemoWorkspace } from "@/features/demo-workspace";
import { useLocalPracticeMeetings } from "@/features/knowledge/local";
import { useRuntimeMeetingList } from "@/features/meetings/runtime/hooks";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";
import { useAnchorRef } from "@/features/demo-tutorial";

type ListTab = "active" | "archived";

export default function DemoMeetingListPage() {
    const run = useReplayRun();
    const workspace = useDemoWorkspace();
    const practice = useLocalPracticeMeetings();
    const archiveRef = useAnchorRef("meetings.archive");
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
                throw new Error("This recording has no archive step.");
            }
            await meetings.refetch();
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
                        <Badge>Prepared demo</Badge>
                        <span className="text-xs text-ink-muted">
                            Recorded meeting list
                        </span>
                    </div>
                    <h1 className="text-2xl font-semibold text-ink">Meetings</h1>
                    <p className="mt-2 text-sm text-ink-secondary">
                        Open the recorded meeting or archive the ended record.
                    </p>
                </div>
                <Link
                    href="/demo"
                    className="m-control inline-flex items-center gap-2 rounded-control border border-control bg-surface px-4 py-2 type-control text-ink hover:bg-surface-raised"
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
                                className="text-lg font-semibold text-ink"
                            >
                                Practice setups
                            </h2>
                            <p className="mt-1 text-sm text-ink-secondary">
                                Temporary browser-memory setups you created by
                                editing the prepared intake. They are separate
                                from the recorded meeting below.
                            </p>
                        </div>
                        <Badge
                            variant="outline"
                            className="border-warning/40 bg-warning-soft text-warning"
                        >
                            Local only
                        </Badge>
                    </div>
                    {practice.meetings.length === 0 ? (
                        <Card className="border-dashed border-separator bg-surface/30 p-5 text-sm text-ink-muted">
                            No practice setup in this tab. Open{" "}
                            <Link
                                href="/demo/new"
                                className="text-action hover:text-action-hover"
                            >
                                New meeting
                            </Link>{" "}
                            and choose <strong>Try editing this setup</strong>{" "}
                            to practice creating one.
                        </Card>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                            {practice.meetings.map((meeting) => (
                                <Card key={meeting.meetingId} className="p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h3 className="font-medium text-ink">
                                                {meeting.name}
                                            </h3>
                                            <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                                                {meeting.agenda ||
                                                    "No additional context"}
                                            </p>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className="border-warning/40 bg-warning-soft text-warning"
                                        >
                                            Practice
                                        </Badge>
                                    </div>
                                    <p className="mt-2 text-xs text-ink-muted">
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
                                            className="m-control inline-flex items-center gap-2 rounded-control border border-control bg-surface px-3 py-2 type-control text-ink hover:bg-surface-raised"
                                        >
                                            Open practice setup
                                            <ArrowRight className="h-4 w-4" />
                                        </Link>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="text-danger hover:text-danger-hover"
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

            <div className="mb-4 inline-flex rounded-group border border-separator bg-surface-raised p-1">
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
                <p role="status" className="type-body text-ink-muted">Loading recorded meetings…</p>
            ) : meetings.error ? (
                <p role="alert" className="rounded-group border border-warning/60 bg-warning-soft p-3 type-body text-warning">
                    {meetings.error.message}
                </p>
            ) : shown.length === 0 ? (
                <Card className="p-10 text-center">
                    <Users className="mx-auto mb-3 h-8 w-8 text-ink-muted" />
                    <p className="type-body text-ink-secondary">
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
                                        Open record
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
                                                    ? "Archive the recorded meeting"
                                                    : "This recording has no archive step"
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
