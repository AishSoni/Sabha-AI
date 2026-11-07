"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    Archive,
    ArrowRight,
    MessageSquare,
    Plus,
    Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import {
    FetchErrorState,
    LoadingState,
    PageContainer,
    PageHeader,
} from "@/components/shell";
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
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const archivedHeadingRef = useRef<HTMLHeadingElement>(null);

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
    const shown = tab === "active" ? active : archived;

    const archive = async (meetingId: string) => {
        setBusyId(meetingId);
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
            window.requestAnimationFrame(() => {
                archivedHeadingRef.current?.focus();
            });
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "The recorded archive step could not be loaded."
            );
        } finally {
            setBusyId(null);
        }
    };

    const firstArchivableId = active.find(
        (meeting) => meeting.status === "ended" || meeting.status === "archived"
    )?.id;

    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title="Meetings"
                description="Open the recorded meeting or archive the ended record. Practice setups are separate browser-memory work."
                backHref="/demo"
                backLabel="Back to the board"
                meta={
                    <>
                        <Badge>Prepared demo</Badge>
                        <span className="type-meta text-ink-muted">
                            Recorded meeting list
                        </span>
                    </>
                }
                actions={
                    <Link
                        href="/demo/new"
                        className="m-control inline-flex min-h-10 items-center gap-2 rounded-control bg-action px-4 type-control font-medium text-action-foreground outline-none hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        <Plus aria-hidden="true" className="size-4" />
                        New meeting
                    </Link>
                }
            />

            <PageContainer>
                {workspace.expanded ? (
                    <section className="mb-10" aria-labelledby="practice-setups">
                        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                            <div>
                                <h2
                                    id="practice-setups"
                                    className="type-section-title text-ink"
                                >
                                    Practice setups
                                </h2>
                                <p className="mt-1 max-w-[68ch] type-body text-ink-secondary">
                                    Temporary browser-memory setups you created
                                    by editing the prepared intake. They are
                                    separate from the recorded meeting below.
                                </p>
                            </div>
                            <Badge
                                variant="outline"
                                className="border-warning/40 bg-warning-soft text-warning"
                            >
                                Practice only
                            </Badge>
                        </div>
                        {practice.meetings.length === 0 ? (
                            <div className="material-raised rounded-group px-5 py-6 type-body text-ink-muted">
                                No practice setup yet. Open{" "}
                                <Link
                                    href="/demo/new"
                                    className="text-action hover:underline"
                                >
                                    New meeting
                                </Link>{" "}
                                and choose{" "}
                                <strong>Try editing this setup</strong> to
                                practice creating one.
                            </div>
                        ) : (
                            <ul className="material-raised divide-y divide-separator overflow-hidden rounded-group">
                                {practice.meetings.map((meeting) => (
                                    <li
                                        key={meeting.meetingId}
                                        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="type-item-title text-ink">
                                                    {meeting.name}
                                                </h3>
                                                <Badge
                                                    variant="outline"
                                                    className="border-warning/40 bg-warning-soft text-warning"
                                                >
                                                    Practice
                                                </Badge>
                                            </div>
                                            <p className="mt-1 line-clamp-2 type-body text-ink-muted">
                                                {meeting.agenda ||
                                                    "No additional context"}
                                            </p>
                                            <p className="mt-1 type-meta text-ink-muted">
                                                {meeting.participants.length}{" "}
                                                participant
                                                {meeting.participants.length ===
                                                1
                                                    ? ""
                                                    : "s"}{" "}
                                                · {meeting.sampleIds.length}{" "}
                                                prepared sample
                                                {meeting.sampleIds.length === 1
                                                    ? ""
                                                    : "s"}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Link
                                                href={`/demo/meetings/${meeting.meetingId}`}
                                                className="m-control inline-flex min-h-9 items-center gap-2 rounded-control border border-control bg-surface px-3 type-control text-ink outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                            >
                                                Open practice setup
                                                <ArrowRight
                                                    aria-hidden="true"
                                                    className="size-4"
                                                />
                                            </Link>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="text-danger hover:bg-danger-soft hover:text-danger"
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
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                ) : null}

                <div
                    role="group"
                    aria-label="Recorded meeting status"
                    className="mb-5 inline-flex rounded-group border border-separator bg-surface-raised p-1"
                >
                    <button
                        type="button"
                        onClick={() => setTab("active")}
                        aria-pressed={tab === "active"}
                        className={`m-control rounded-control px-3 py-2 type-control ${
                            tab === "active"
                                ? "bg-surface-selected text-ink"
                                : "text-ink-secondary hover:text-ink"
                        }`}
                    >
                        <MessageSquare
                            aria-hidden="true"
                            className="mr-2 inline size-4"
                        />
                        Active and ended
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab("archived")}
                        aria-pressed={tab === "archived"}
                        className={`m-control rounded-control px-3 py-2 type-control ${
                            tab === "archived"
                                ? "bg-surface-selected text-ink"
                                : "text-ink-secondary hover:text-ink"
                        }`}
                    >
                        <Archive
                            aria-hidden="true"
                            className="mr-2 inline size-4"
                        />
                        Archived
                    </button>
                </div>

                {error ? (
                    <Notice tone="danger" className="mb-4">
                        {error}
                    </Notice>
                ) : null}

                {meetings.isLoading ? (
                    <LoadingState label="Loading recorded meetings…" rows={4} />
                ) : meetings.error ? (
                    <FetchErrorState
                        title="Recorded meetings are unavailable"
                        description={meetings.error.message}
                        onRetry={() => void meetings.refetch()}
                        busy={meetings.isFetching}
                    />
                ) : shown.length === 0 ? (
                    <EmptyState
                        icon={<Users className="size-6" />}
                        title={
                            tab === "active"
                                ? "No active or ended recorded meeting"
                                : "No archived recorded meeting"
                        }
                        description={
                            list.length === 0
                                ? "This recording does not expose a meeting list."
                                : tab === "active"
                                  ? "The recorded meeting has moved to the archive."
                                  : "Archive the ended record to keep it here."
                        }
                        className="material-raised rounded-group"
                    />
                ) : (
                    <section aria-labelledby="recorded-meetings-heading">
                        <h2
                            id="recorded-meetings-heading"
                            ref={
                                tab === "archived"
                                    ? archivedHeadingRef
                                    : undefined
                            }
                            tabIndex={tab === "archived" ? -1 : undefined}
                            className="mb-3 type-section-title text-ink"
                        >
                            {tab === "active"
                                ? "Active and ended"
                                : "Archived meetings"}
                        </h2>
                        <ul className="material-raised divide-y divide-separator overflow-hidden rounded-group">
                            {shown.map((meeting) => {
                                const isArchived =
                                    meeting.status === "archived";
                                const isEnded =
                                    meeting.status === "ended" || isArchived;
                                return (
                                    <li
                                        key={meeting.id}
                                        data-testid={`recorded-meeting-${meeting.id}`}
                                        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="type-item-title text-ink">
                                                    {meeting.name}
                                                </h3>
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
                                                <span className="type-meta text-ink-muted">
                                                    Recorded demo
                                                </span>
                                            </div>
                                            <p className="mt-1 line-clamp-2 type-body text-ink-muted">
                                                {meeting.agenda ||
                                                    "No agenda saved with this recording."}
                                            </p>
                                            <p className="mt-1 type-meta text-ink-muted">
                                                {new Date(
                                                    meeting.created_at
                                                ).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Link
                                                href={`/demo/meetings/${meeting.id}`}
                                                className="m-control inline-flex min-h-9 items-center gap-2 rounded-control border border-control bg-surface px-3 type-control text-ink outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                            >
                                                Open record
                                                <ArrowRight
                                                    aria-hidden="true"
                                                    className="size-4"
                                                />
                                            </Link>
                                            {isEnded && !isArchived ? (
                                                <Button
                                                    ref={
                                                        meeting.id ===
                                                        firstArchivableId
                                                            ? archiveRef
                                                            : undefined
                                                    }
                                                    size="sm"
                                                    data-testid="archive-meeting"
                                                    busy={busyId === meeting.id}
                                                    busyLabel="Archiving"
                                                    disabled={
                                                        !canArchive ||
                                                        (busyId !== null &&
                                                            busyId !==
                                                                meeting.id)
                                                    }
                                                    onClick={() =>
                                                        void archive(meeting.id)
                                                    }
                                                    title={
                                                        canArchive
                                                            ? "Archive the recorded meeting"
                                                            : "This recording has no archive step"
                                                    }
                                                >
                                                    <Archive
                                                        aria-hidden="true"
                                                        className="size-4"
                                                    />
                                                    Archive
                                                </Button>
                                            ) : null}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
            </PageContainer>
        </main>
    );
}
