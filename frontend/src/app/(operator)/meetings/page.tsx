"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    Archive,
    ArchiveRestore,
    Calendar,
    Loader2,
    MessageSquare,
    MoreVertical,
    Plus,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    FetchErrorState,
    LoadingState,
    PageContainer,
    PageHeader,
} from "@/components/shell";
import {
    useMeetingList,
    useArchiveMeeting,
    useUnarchiveMeeting,
    useDeleteMeeting,
    type Meeting,
} from "@/features/meetings";
import { formatRelativeTime } from "@/lib/utils";

function statusBadge(status: Meeting["status"]) {
    switch (status) {
        case "active":
            return <StatusBadge tone="success">Active</StatusBadge>;
        case "ended":
            return <StatusBadge tone="neutral">Ended</StatusBadge>;
        case "voting":
            return <StatusBadge tone="warning">Voting</StatusBadge>;
        case "archived":
            return <StatusBadge tone="neutral">Archived</StatusBadge>;
        default:
            return <StatusBadge tone="neutral">{status}</StatusBadge>;
    }
}

export default function MeetingSpacePage() {
    const meetings = useMeetingList();
    const list = useMemo(() => meetings.data ?? [], [meetings.data]);
    const archiveMeeting = useArchiveMeeting();
    const unarchiveMeeting = useUnarchiveMeeting();
    const deleteMeeting = useDeleteMeeting();

    const [activeTab, setActiveTab] = useState("active");
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState("");
    const listHeadingRef = useRef<HTMLHeadingElement>(null);

    const activeMeetings = useMemo(
        () =>
            list.filter(
                (meeting) =>
                    meeting.status === "active" ||
                    meeting.status === "ended" ||
                    meeting.status === "voting"
            ),
        [list]
    );
    const archivedMeetings = useMemo(
        () => list.filter((meeting) => meeting.status === "archived"),
        [list]
    );

    const focusList = () => {
        window.requestAnimationFrame(() => listHeadingRef.current?.focus());
    };

    const handleArchive = (meeting: Meeting) => {
        setActionLoading(meeting.id);
        setActionError(null);
        archiveMeeting.mutate(meeting.id, {
            onSuccess: () => {
                setAnnouncement(`${meeting.name} archived.`);
                focusList();
            },
            onError: (cause) =>
                setActionError(
                    cause instanceof Error
                        ? cause.message
                        : "The meeting could not be archived."
                ),
            onSettled: () => setActionLoading(null),
        });
    };

    const handleUnarchive = (meeting: Meeting) => {
        setActionLoading(meeting.id);
        setActionError(null);
        unarchiveMeeting.mutate(meeting.id, {
            onSuccess: () => {
                setAnnouncement(`${meeting.name} restored to the active list.`);
                focusList();
            },
            onError: (cause) =>
                setActionError(
                    cause instanceof Error
                        ? cause.message
                        : "The meeting could not be restored."
                ),
            onSettled: () => setActionLoading(null),
        });
    };

    const handleDelete = (meetingId: string) => {
        setActionLoading(meetingId);
        setActionError(null);
        deleteMeeting.mutate(meetingId, {
            onSuccess: () => {
                setAnnouncement("Meeting deleted.");
            },
            onError: (cause) =>
                setActionError(
                    cause instanceof Error
                        ? cause.message
                        : "The meeting could not be deleted."
                ),
            onSettled: () => {
                setActionLoading(null);
                setDeleteConfirmId(null);
            },
        });
    };

    const noMeetings = !meetings.isLoading && !meetings.isError && list.length === 0;

    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title="Meetings"
                description="Open a meeting room, review its lifecycle, or archive an ended record."
                actions={
                    <Link
                        href="/meetings/new"
                        className="m-control inline-flex min-h-10 items-center gap-2 rounded-control bg-action px-4 type-control font-medium text-action-foreground outline-none hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                        <Plus aria-hidden="true" className="size-4" />
                        Create meeting
                    </Link>
                }
            />

            <PageContainer>
                {actionError ? (
                    <Notice tone="danger" className="mb-4">
                        {actionError}
                    </Notice>
                ) : null}
                <p aria-live="polite" className="sr-only">
                    {announcement}
                </p>

                {meetings.isError && list.length === 0 ? (
                    <FetchErrorState
                        title="Meetings are unavailable"
                        description={meetings.error.message}
                        onRetry={() => void meetings.refetch()}
                        busy={meetings.isFetching}
                    />
                ) : (
                    <Tabs
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className="w-full"
                    >
                        <TabsList className="mb-5 h-auto flex-wrap justify-start">
                            <TabsTrigger value="active">
                                <MessageSquare
                                    aria-hidden="true"
                                    className="size-4"
                                />
                                Active
                                {activeMeetings.length > 0 ? (
                                    <StatusBadge
                                        tone="neutral"
                                        className="ml-2"
                                    >
                                        {activeMeetings.length}
                                    </StatusBadge>
                                ) : null}
                            </TabsTrigger>
                            <TabsTrigger value="archived">
                                <Archive
                                    aria-hidden="true"
                                    className="size-4"
                                />
                                Archived
                                {archivedMeetings.length > 0 ? (
                                    <StatusBadge
                                        tone="neutral"
                                        className="ml-2"
                                    >
                                        {archivedMeetings.length}
                                    </StatusBadge>
                                ) : null}
                            </TabsTrigger>
                        </TabsList>

                        {meetings.isError ? (
                            <Notice tone="warning" className="mb-4">
                                The latest list could not be refreshed. Showing
                                the last loaded meetings.{" "}
                                <button
                                    type="button"
                                    className="font-medium underline underline-offset-2"
                                    onClick={() => void meetings.refetch()}
                                >
                                    Try again
                                </button>
                            </Notice>
                        ) : null}

                        <TabsContent value="active">
                            <h2
                                ref={
                                    activeTab === "active"
                                        ? listHeadingRef
                                        : undefined
                                }
                                tabIndex={activeTab === "active" ? -1 : undefined}
                                className="sr-only"
                            >
                                Active meetings
                            </h2>
                            {meetings.isLoading ? (
                                <LoadingState label="Loading meetings…" />
                            ) : activeMeetings.length === 0 ? (
                                <EmptyState
                                    icon={<MessageSquare className="size-6" />}
                                    title={
                                        noMeetings
                                            ? "No meeting rooms yet"
                                            : "No active meetings"
                                    }
                                    description={
                                        noMeetings
                                            ? "Create your first meeting room to get started."
                                            : archivedMeetings.length > 0
                                              ? "Archived meetings are available in the Archived tab."
                                              : "Create a meeting room to get started."
                                    }
                                    action={
                                        <Link href="/meetings/new">
                                            <Button>
                                                <Plus
                                                    aria-hidden="true"
                                                    className="size-4"
                                                />
                                                Create meeting
                                            </Button>
                                        </Link>
                                    }
                                    className="material-raised rounded-group"
                                />
                            ) : (
                                <MeetingRows
                                    meetings={activeMeetings}
                                    headingRef={listHeadingRef}
                                    archived={false}
                                    actionLoading={actionLoading}
                                    onArchive={handleArchive}
                                    onUnarchive={handleUnarchive}
                                    onDelete={(meeting) =>
                                        setDeleteConfirmId(meeting.id)
                                    }
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="archived">
                            <h2
                                ref={
                                    activeTab === "archived"
                                        ? listHeadingRef
                                        : undefined
                                }
                                tabIndex={
                                    activeTab === "archived" ? -1 : undefined
                                }
                                className="sr-only"
                            >
                                Archived meetings
                            </h2>
                            {meetings.isLoading ? (
                                <LoadingState label="Loading meetings…" />
                            ) : archivedMeetings.length === 0 ? (
                                <EmptyState
                                    icon={<Archive className="size-6" />}
                                    title="No archived meetings"
                                    description={
                                        noMeetings
                                            ? "Meetings you archive will appear here."
                                            : "Archive an ended meeting to keep its record here."
                                    }
                                    className="material-raised rounded-group"
                                />
                            ) : (
                                <MeetingRows
                                    meetings={archivedMeetings}
                                    headingRef={listHeadingRef}
                                    archived
                                    actionLoading={actionLoading}
                                    onArchive={handleArchive}
                                    onUnarchive={handleUnarchive}
                                    onDelete={(meeting) =>
                                        setDeleteConfirmId(meeting.id)
                                    }
                                />
                            )}
                        </TabsContent>
                    </Tabs>
                )}

                <AlertDialog
                    open={!!deleteConfirmId}
                    onOpenChange={(open) =>
                        !open ? setDeleteConfirmId(null) : undefined
                    }
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete meeting?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This permanently deletes the meeting and all its
                                messages, participants, and stored data. It
                                cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() =>
                                    deleteConfirmId &&
                                    handleDelete(deleteConfirmId)
                                }
                                className="bg-danger text-on-danger hover:bg-danger-hover"
                            >
                                {actionLoading === deleteConfirmId ? (
                                    <Loader2
                                        aria-hidden="true"
                                        className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                                    />
                                ) : (
                                    <Trash2
                                        aria-hidden="true"
                                        className="mr-2 size-4"
                                    />
                                )}
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </PageContainer>
        </main>
    );
}

function MeetingRows({
    meetings,
    archived,
    actionLoading,
    onArchive,
    onUnarchive,
    onDelete,
}: {
    meetings: Meeting[];
    headingRef?: React.RefObject<HTMLHeadingElement | null>;
    archived: boolean;
    actionLoading: string | null;
    onArchive: (meeting: Meeting) => void;
    onUnarchive: (meeting: Meeting) => void;
    onDelete: (meeting: Meeting) => void;
}) {
    return (
        <ul className="material-raised divide-y divide-separator overflow-hidden rounded-group">
            {meetings.map((meeting) => {
                const busy = actionLoading === meeting.id;
                return (
                    <li
                        key={meeting.id}
                        data-testid={`meeting-row-${meeting.id}`}
                        className="flex flex-col gap-3 p-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="type-item-title text-ink">
                                    {meeting.name}
                                </h3>
                                {statusBadge(meeting.status)}
                            </div>
                            {meeting.agenda ? (
                                <p className="mt-1 line-clamp-2 max-w-[74ch] type-body text-ink-secondary">
                                    {meeting.agenda}
                                </p>
                            ) : (
                                <p className="mt-1 type-body text-ink-muted">
                                    No agenda saved.
                                </p>
                            )}
                            <p className="mt-1 flex flex-wrap items-center gap-2 type-meta text-ink-muted">
                                <Calendar
                                    aria-hidden="true"
                                    className="size-3.5"
                                />
                                <span>
                                    {formatRelativeTime(
                                        meeting.created_at ?? ""
                                    )}
                                </span>
                                {busy ? (
                                    <span
                                        role="status"
                                        className="inline-flex items-center gap-1"
                                    >
                                        <Loader2
                                            aria-hidden="true"
                                            className="size-3 animate-spin motion-reduce:animate-none"
                                        />
                                        Updating row
                                    </span>
                                ) : null}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Link
                                href={`/meetings/${meeting.id}`}
                                className="m-control inline-flex min-h-9 items-center rounded-control border border-control bg-surface px-3 type-control text-ink outline-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                Open meeting
                            </Link>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`More actions for ${meeting.name}`}
                                        disabled={busy}
                                    >
                                        {busy ? (
                                            <Loader2
                                                aria-hidden="true"
                                                className="animate-spin motion-reduce:animate-none"
                                            />
                                        ) : (
                                            <MoreVertical aria-hidden="true" />
                                        )}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {archived ? (
                                        <DropdownMenuItem
                                            onClick={() =>
                                                onUnarchive(meeting)
                                            }
                                        >
                                            <ArchiveRestore
                                                aria-hidden="true"
                                                className="mr-2 size-4"
                                            />
                                            Unarchive
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem
                                            onClick={() => onArchive(meeting)}
                                        >
                                            <Archive
                                                aria-hidden="true"
                                                className="mr-2 size-4"
                                            />
                                            Archive
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => onDelete(meeting)}
                                        className="text-danger focus:bg-danger-soft focus:text-danger"
                                    >
                                        <Trash2
                                            aria-hidden="true"
                                            className="mr-2 size-4"
                                        />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
