'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, MessageSquare, Calendar, ArrowLeft, Loader2, Archive, Trash2, MoreVertical, ArchiveRestore, AlertTriangle, RefreshCw, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMeetingList, useArchiveMeeting, useUnarchiveMeeting, useDeleteMeeting, meetingKeys, type Meeting } from '@/features/meetings';
import { isApiError } from '@/shared/api/errors';
import { formatRelativeTime } from '@/lib/utils';


type MeetingAction = 'archive' | 'unarchive' | 'delete';

interface ActionNotice {
    tone: 'success' | 'error';
    message: string;
    meetingId: string;
}

export default function MeetingSpacePage() {
    const { data, isLoading, isError, error, refetch } = useMeetingList();
    const list = data ?? [];
    const hasLoadedList = data !== undefined;
    const archiveMeeting = useArchiveMeeting();
    const unarchiveMeeting = useUnarchiveMeeting();
    const deleteMeeting = useDeleteMeeting();
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState('active');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);

    useEffect(() => {
        if (actionNotice?.tone !== 'success') return;
        const timeout = window.setTimeout(() => setActionNotice(null), 6000);
        return () => window.clearTimeout(timeout);
    }, [actionNotice]);

    const meetingName = (meetingId: string) =>
        list.find((meeting) => meeting.id === meetingId)?.name ?? 'This meeting';

    const reconcileAfterFailure = (meetingId: string) => {
        void refetch();
        void queryClient.invalidateQueries({
            queryKey: meetingKeys.detail(meetingId),
        });
    };

    const handleArchive = (meetingId: string) => {
        setActionLoading(meetingId);
        setActionNotice(null);
        archiveMeeting.mutate(meetingId, {
            onSuccess: () => {
                setActionNotice({
                    tone: 'success',
                    message: `“${meetingName(meetingId)}” was archived. You can find it in Archived.`,
                    meetingId,
                });
            },
            onError: (mutationError) => {
                setActionNotice({
                    tone: 'error',
                    message: actionFailureMessage('archive', mutationError),
                    meetingId,
                });
                reconcileAfterFailure(meetingId);
            },
            onSettled: () => setActionLoading(null),
        });
    };

    const handleUnarchive = (meetingId: string) => {
        setActionLoading(meetingId);
        setActionNotice(null);
        unarchiveMeeting.mutate(meetingId, {
            onSuccess: () => {
                setActionNotice({
                    tone: 'success',
                    message: `“${meetingName(meetingId)}” was restored to its lifecycle state. Unarchiving does not reopen an ended meeting.`,
                    meetingId,
                });
            },
            onError: (mutationError) => {
                setActionNotice({
                    tone: 'error',
                    message: actionFailureMessage('unarchive', mutationError),
                    meetingId,
                });
                reconcileAfterFailure(meetingId);
            },
            onSettled: () => setActionLoading(null),
        });
    };

    const handleDelete = (meetingId: string) => {
        setActionLoading(meetingId);
        setActionNotice(null);
        deleteMeeting.mutate(meetingId, {
            onSuccess: () => {
                setDeleteConfirmId(null);
                setActionNotice({
                    tone: 'success',
                    message: `“${meetingName(meetingId)}” was deleted.`,
                    meetingId,
                });
            },
            onError: (mutationError) => {
                setActionNotice({
                    tone: 'error',
                    message: actionFailureMessage('delete', mutationError),
                    meetingId,
                });
                reconcileAfterFailure(meetingId);
            },
            onSettled: () => setActionLoading(null),
        });
    };

    // Filter meetings by status
    const activeMeetings = list.filter(m => m.status === 'active' || m.status === 'voting');
    const endedMeetings = list.filter(m => m.status === 'ended');
    const archivedMeetings = list.filter(m => m.status === 'archived');

    return (
        <div className="min-h-full text-ink">
            {/* Header */}
            <header className="material-chrome sticky top-0 z-chrome border-b border-separator">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            aria-label="Back to Sabha home"
                            className="m-control text-ink-muted hover:text-ink"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div>
                            <h1 className="type-page-title text-ink">Meeting Space</h1>
                            <p className="type-meta text-ink-muted">Manage your AI meeting rooms</p>
                        </div>
                    </div>
                    <Link href="/meetings/new">
                        <Button>
                            <Plus className="h-4 w-4" />
                            Create meeting
                        </Button>
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main id="main-content" className="max-w-6xl mx-auto px-6 py-8" tabIndex={-1}>
                {isError && !hasLoadedList ? (
                    <ListUnavailable
                        message={readFailureMessage(error)}
                        onRetry={() => void refetch()}
                    />
                ) : (
                    <>
                        {isError && hasLoadedList && (
                            <StaleListNotice
                                message={readFailureMessage(error)}
                                onRetry={() => void refetch()}
                            />
                        )}
                        {actionNotice && (
                            <ActionFeedback
                                notice={actionNotice}
                                onDismiss={() => setActionNotice(null)}
                            />
                        )}
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="mb-6">
                                <TabsTrigger value="active">
                                    <MessageSquare className="h-4 w-4" />
                                    Active
                                    {activeMeetings.length > 0 && (
                                        <StatusBadge tone="neutral" className="ml-2">
                                            {activeMeetings.length}
                                        </StatusBadge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="ended">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Ended
                                    {endedMeetings.length > 0 && (
                                        <StatusBadge tone="neutral" className="ml-2">
                                            {endedMeetings.length}
                                        </StatusBadge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="archived">
                                    <Archive className="h-4 w-4" />
                                    Archived
                                    {archivedMeetings.length > 0 && (
                                        <StatusBadge tone="neutral" className="ml-2">
                                            {archivedMeetings.length}
                                        </StatusBadge>
                                    )}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="active">
                                {isLoading ? (
                                    <LoadingState />
                                ) : activeMeetings.length === 0 ? (
                                    <EmptyState />
                                ) : (
                                    <MeetingGrid
                                        meetings={activeMeetings}
                                        onArchive={handleArchive}
                                        onDelete={(id) => setDeleteConfirmId(id)}
                                        actionLoading={actionLoading}
                                        isArchived={false}
                                    />
                                )}
                            </TabsContent>

                            <TabsContent value="ended">
                                {isLoading ? (
                                    <LoadingState />
                                ) : endedMeetings.length === 0 ? (
                                    <div className="py-20 text-center">
                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-group bg-surface-raised">
                                            <CheckCircle2 className="h-8 w-8 text-ink-muted" />
                                        </div>
                                        <h3 className="type-item-title mb-2 text-ink">No ended meetings</h3>
                                        <p className="type-body text-ink-secondary">
                                            Meetings appear here after their closing process completes.
                                        </p>
                                    </div>
                                ) : (
                                    <MeetingGrid
                                        meetings={endedMeetings}
                                        onArchive={handleArchive}
                                        onDelete={(id) => setDeleteConfirmId(id)}
                                        actionLoading={actionLoading}
                                        isArchived={false}
                                    />
                                )}
                            </TabsContent>

                            <TabsContent value="archived">
                                {isLoading ? (
                                    <LoadingState />
                                ) : archivedMeetings.length === 0 ? (
                                    <div className="py-20 text-center">
                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-group bg-surface-raised">
                                            <Archive className="h-8 w-8 text-ink-muted" />
                                        </div>
                                        <h3 className="type-item-title mb-2 text-ink">No archived meetings</h3>
                                        <p className="type-body text-ink-secondary">Meetings you archive will appear here</p>
                                    </div>
                                ) : (
                                    <MeetingGrid
                                        meetings={archivedMeetings}
                                        onUnarchive={handleUnarchive}
                                        onDelete={(id) => setDeleteConfirmId(id)}
                                        actionLoading={actionLoading}
                                        isArchived={true}
                                    />
                                )}
                            </TabsContent>
                        </Tabs>
                    </>
                )}
            </main>



            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={!!deleteConfirmId}
                onOpenChange={(open) => {
                    if (open) return;
                    if (deleteConfirmId && actionLoading === deleteConfirmId) return;
                    setDeleteConfirmId(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Meeting?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the meeting
                            and all its messages, participants, and data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {actionNotice?.tone === 'error' &&
                        actionNotice.meetingId === deleteConfirmId && (
                            <p
                                role="alert"
                                className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2 type-body text-danger"
                            >
                                {actionNotice.message}
                            </p>
                        )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={actionLoading === deleteConfirmId}>
                            Cancel
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                            disabled={actionLoading === deleteConfirmId}
                            className="bg-danger text-on-danger hover:bg-danger-hover"
                        >
                            {actionLoading === deleteConfirmId ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                            ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Delete
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function readFailureMessage(error: Error | null): string {
    if (isApiError(error)) {
        if (error.status === 401 || error.status === 403) {
            return 'Meeting space access is unavailable. Check operator access and try again.';
        }
        if (error.kind === 'network') {
            return 'Meeting space could not be reached. Check your connection and try again.';
        }
        if (error.detail && error.detail !== 'Unknown error') {
            return `Meeting space could not be loaded: ${error.detail}`;
        }
    }
    return 'Meeting space could not be loaded. Try again.';
}

function ListUnavailable({
    message,
    onRetry,
}: {
    message: string;
    onRetry: () => void;
}) {
    return (
        <div
            role="alert"
            className="mx-auto max-w-xl rounded-group border border-warning/50 bg-warning-soft p-8 text-center"
        >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-group bg-surface-raised">
                <AlertTriangle className="h-7 w-7 text-warning" />
            </div>
            <h2 className="type-item-title mb-2 text-ink">Meeting space unavailable</h2>
            <p className="type-body mb-6 text-ink-secondary">{message}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
            </Button>
            <p className="mt-4 type-meta text-ink-muted">
                Your meetings were not changed.
            </p>
        </div>
    );
}

function StaleListNotice({
    message,
    onRetry,
}: {
    message: string;
    onRetry: () => void;
}) {
    return (
        <div
            role="status"
            aria-live="polite"
            className="mb-6 flex flex-wrap items-center gap-3 rounded-control border border-warning/50 bg-warning-soft px-4 py-3 type-body text-ink"
        >
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
                <p className="font-medium">Showing the last loaded meetings.</p>
                <p className="type-meta text-ink-secondary">{message}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
            </Button>
        </div>
    );
}

function actionFailureMessage(action: MeetingAction, error: Error): string {
    const label =
        action === 'archive' ? 'Archive' : action === 'unarchive' ? 'Unarchive' : 'Delete';

    if (isApiError(error)) {
        if (error.status === 404) {
            return `${label} failed because this meeting no longer exists. The list has been refreshed.`;
        }
        if (error.status === 401 || error.status === 403) {
            return `${label} failed because meeting access is unavailable. Refresh and try again.`;
        }
        if (action === 'archive' && error.status === 409) {
            return 'This meeting is still closing. Archive it after the close finishes.';
        }
        if (action === 'archive' && error.status === 400) {
            return 'This meeting was already archived. The list has been refreshed.';
        }
        if (action === 'unarchive' && error.status === 400) {
            return 'This meeting is no longer archived. The list has been refreshed.';
        }
        if (action !== 'delete' && error.status === 409) {
            return 'This meeting is still closing. Try again after the close finishes.';
        }
        if (action === 'delete' && error.status === 503) {
            return 'The meeting was not deleted because its knowledge files could not be cleaned up. Try again.';
        }
        if (error.kind === 'network') {
            return `${label} failed because the server could not be reached. The meeting was not changed.`;
        }
        if (error.detail && error.detail !== 'Unknown error') {
            return `${label} failed: ${error.detail}. The meeting was not changed.`;
        }
    }

    return `${label} failed. The meeting was not changed. Try again.`;
}

function ActionFeedback({
    notice,
    onDismiss,
}: {
    notice: ActionNotice;
    onDismiss: () => void;
}) {
    const isError = notice.tone === 'error';
    return (
        <div
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={`mb-6 flex items-start gap-3 rounded-control border px-4 py-3 type-body ${
                isError
                    ? 'border-danger/40 bg-danger-soft text-danger'
                    : 'border-success/40 bg-success-soft text-ink'
            }`}
        >
            {isError ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            )}
            <p className="min-w-0 flex-1">{notice.message}</p>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss action message"
                className="m-control shrink-0 text-ink-muted hover:text-ink"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

function LoadingState() {
    return (
        <div role="status" className="flex items-center justify-center gap-2 py-20 type-body text-ink-muted">
            <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" />
            <span>Loading meetings…</span>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-group bg-surface-raised">
                <MessageSquare className="h-8 w-8 text-ink-muted" />
            </div>
            <h3 className="type-item-title mb-2 text-ink">No meeting rooms yet</h3>
            <p className="type-body mb-6 text-ink-secondary">Create your first meeting room to get started</p>
            <Link href="/meetings/new">
                <Button>
                    <Plus className="h-4 w-4" />
                    Create meeting
                </Button>
            </Link>
        </div>
    );
}

interface MeetingGridProps {
    meetings: Meeting[];
    onArchive?: (id: string) => void;
    onUnarchive?: (id: string) => void;
    onDelete: (id: string) => void;
    actionLoading: string | null;
    isArchived: boolean;
}

function MeetingGrid({ meetings, onArchive, onUnarchive, onDelete, actionLoading, isArchived }: MeetingGridProps) {
    const getStatusBadge = (status: Meeting['status']) => {
        switch (status) {
            case 'active':
                return <StatusBadge tone="success">Active</StatusBadge>;
            case 'ended':
                return <StatusBadge tone="neutral">Ended</StatusBadge>;
            case 'voting':
                return <StatusBadge tone="warning">Voting</StatusBadge>;
            case 'archived':
                return <StatusBadge tone="neutral">Archived</StatusBadge>;
            default:
                return <StatusBadge tone="neutral">{status}</StatusBadge>;
        }
    };

    return (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meetings.map((meeting) => (
                <div key={meeting.id} className="relative group">
                    <Link href={`/meetings/${meeting.id}`}>
                        <Card className="h-full m-control cursor-pointer hover:border-action/50 hover:shadow-[var(--shadow-raised)]">
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between gap-3">
                                    <CardTitle className="type-item-title pr-8">
                                        {meeting.name}
                                    </CardTitle>
                                    {getStatusBadge(meeting.status)}
                                </div>
                                {meeting.agenda && (
                                    <CardDescription className="line-clamp-2">
                                        {meeting.agenda}
                                    </CardDescription>
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4 type-meta text-ink-muted">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {formatRelativeTime(meeting.created_at ?? '')}
                                    </span>
                                    {(meeting.total_cost ?? 0) > 0 && (
                                        <span className="type-tabular text-ink-secondary">
                                            ${(meeting.total_cost ?? 0).toFixed(4)}
                                        </span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    {/* Action Menu */}
                    <div className="absolute right-3 top-3 z-selection">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label={`Actions for ${meeting.name}`}
                                    className="border border-separator bg-surface/80"
                                    disabled={actionLoading === meeting.id}
                                    onClick={(e) => e.preventDefault()}
                                >
                                    {actionLoading === meeting.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                                    ) : (
                                        <MoreVertical className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {isArchived ? (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault();
                                            onUnarchive?.(meeting.id);
                                        }}
                                    >
                                        <ArchiveRestore className="mr-2 h-4 w-4" />
                                        Unarchive
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault();
                                            onArchive?.(meeting.id);
                                        }}
                                    >
                                        <Archive className="mr-2 h-4 w-4" />
                                        Archive
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onDelete(meeting.id);
                                    }}
                                    className="text-danger focus:bg-danger-soft focus:text-danger"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            ))}
        </div>
    );
}
