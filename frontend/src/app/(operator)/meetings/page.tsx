'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, Calendar, ArrowLeft, Loader2, Archive, Trash2, MoreVertical, ArchiveRestore } from 'lucide-react';
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
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMeetingList, useArchiveMeeting, useUnarchiveMeeting, useDeleteMeeting, type Meeting } from '@/features/meetings';
import { formatRelativeTime } from '@/lib/utils';


export default function MeetingSpacePage() {
    const { data, isLoading } = useMeetingList();
    const list = data ?? [];
    const archiveMeeting = useArchiveMeeting();
    const unarchiveMeeting = useUnarchiveMeeting();
    const deleteMeeting = useDeleteMeeting();

    const [activeTab, setActiveTab] = useState('active');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const handleArchive = (meetingId: string) => {
        setActionLoading(meetingId);
        archiveMeeting.mutate(meetingId, { onSettled: () => setActionLoading(null) });
    };

    const handleUnarchive = (meetingId: string) => {
        setActionLoading(meetingId);
        unarchiveMeeting.mutate(meetingId, { onSettled: () => setActionLoading(null) });
    };

    const handleDelete = (meetingId: string) => {
        setActionLoading(meetingId);
        deleteMeeting.mutate(meetingId, {
            onSettled: () => {
                setActionLoading(null);
                setDeleteConfirmId(null);
            },
        });
    };

    // Filter meetings by status
    const activeMeetings = list.filter(m => m.status === 'active' || m.status === 'ended' || m.status === 'voting');
    const archivedMeetings = list.filter(m => m.status === 'archived');

    return (
        <div className="min-h-screen bg-canvas text-ink">
            {/* Header */}
            <header className="sticky top-0 z-chrome border-b border-separator bg-canvas/80 backdrop-blur-sm">
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
                            Create Meeting Room
                        </Button>
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
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
            </main>



            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Meeting?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the meeting
                            and all its messages, participants, and data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                            className="bg-danger text-on-danger hover:bg-danger-hover"
                        >
                            {actionLoading === deleteConfirmId ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                            ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
                    Create Meeting Room
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
