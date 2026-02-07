'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, Calendar, ArrowLeft, Loader2, Archive, Trash2, MoreVertical, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { api, Meeting } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';


export default function MeetingSpacePage() {
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [activeTab, setActiveTab] = useState('active');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        loadMeetings();
    }, []);

    const loadMeetings = async () => {
        setIsLoading(true);
        try {
            const data = await api.listMeetings();
            setMeetings(data);
        } catch (err) {
            console.error('Failed to load meetings:', err);
        } finally {
            setIsLoading(false);
        }
    };



    const handleArchive = async (meetingId: string) => {
        setActionLoading(meetingId);
        try {
            await api.archiveMeeting(meetingId);
            await loadMeetings();
        } catch (err) {
            console.error('Failed to archive meeting:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleUnarchive = async (meetingId: string) => {
        setActionLoading(meetingId);
        try {
            await api.unarchiveMeeting(meetingId);
            await loadMeetings();
        } catch (err) {
            console.error('Failed to unarchive meeting:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (meetingId: string) => {
        setActionLoading(meetingId);
        try {
            await api.deleteMeeting(meetingId);
            await loadMeetings();
        } catch (err) {
            console.error('Failed to delete meeting:', err);
        } finally {
            setActionLoading(null);
            setDeleteConfirmId(null);
        }
    };

    // Filter meetings by status
    const activeMeetings = meetings.filter(m => m.status === 'active' || m.status === 'ended' || m.status === 'voting');
    const archivedMeetings = meetings.filter(m => m.status === 'archived');

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">Meeting Space</h1>
                            <p className="text-xs text-zinc-500">Manage your AI meeting rooms</p>
                        </div>
                    </div>
                    <Link href="/meetings/new">
                        <Button className="bg-indigo-600 hover:bg-indigo-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Create Meeting Room
                        </Button>
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="bg-zinc-900/50 border border-zinc-800 mb-6">
                        <TabsTrigger value="active" className="data-[state=active]:bg-zinc-800">
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Active
                            {activeMeetings.length > 0 && (
                                <Badge variant="secondary" className="ml-2 bg-indigo-500/20 text-indigo-400">
                                    {activeMeetings.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="archived" className="data-[state=active]:bg-zinc-800">
                            <Archive className="w-4 h-4 mr-2" />
                            Archived
                            {archivedMeetings.length > 0 && (
                                <Badge variant="secondary" className="ml-2 bg-zinc-700 text-zinc-400">
                                    {archivedMeetings.length}
                                </Badge>
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
                            <div className="text-center py-20">
                                <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                                    <Archive className="w-8 h-8 text-zinc-600" />
                                </div>
                                <h3 className="text-lg font-medium text-white mb-2">No archived meetings</h3>
                                <p className="text-zinc-500">Meetings you archive will appear here</p>
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
                <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Delete Meeting?</AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                            This action cannot be undone. This will permanently delete the meeting
                            and all its messages, participants, and data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {actionLoading === deleteConfirmId ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Trash2 className="w-4 h-4 mr-2" />
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
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
    );
}

function EmptyState() {
    return (
        <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-zinc-600" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No meeting rooms yet</h3>
            <p className="text-zinc-500 mb-6">Create your first meeting room to get started</p>
            <Link href="/meetings/new">
                <Button className="bg-indigo-600 hover:bg-indigo-700">
                    <Plus className="w-4 h-4 mr-2" />
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
                return <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400">Active</Badge>;
            case 'ended':
                return <Badge variant="secondary" className="bg-indigo-500/20 text-indigo-400">Ended</Badge>;
            case 'voting':
                return <Badge variant="secondary" className="bg-amber-500/20 text-amber-400">Voting</Badge>;
            case 'archived':
                return <Badge variant="secondary" className="bg-zinc-700 text-zinc-400">Archived</Badge>;
            default:
                return <Badge variant="secondary" className="bg-zinc-700 text-zinc-400">{status}</Badge>;
        }
    };

    return (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meetings.map((meeting) => (
                <div key={meeting.id} className="relative group">
                    <Link href={`/meetings/${meeting.id}`}>
                        <Card className="bg-zinc-900/50 border-zinc-800 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 cursor-pointer h-full">
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <CardTitle className="text-white text-lg pr-8">
                                        {meeting.name}
                                    </CardTitle>
                                    {getStatusBadge(meeting.status)}
                                </div>
                                {meeting.agenda && (
                                    <CardDescription className="text-zinc-400 line-clamp-2">
                                        {meeting.agenda}
                                    </CardDescription>
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4 text-xs text-zinc-500">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {formatRelativeTime(meeting.created_at)}
                                    </span>
                                    {meeting.total_cost > 0 && (
                                        <span className="text-amber-500">
                                            ${meeting.total_cost.toFixed(4)}
                                        </span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    {/* Action Menu */}
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="h-7 w-7 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700"
                                    onClick={(e) => e.preventDefault()}
                                >
                                    {actionLoading === meeting.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <MoreVertical className="w-3.5 h-3.5" />
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                                {isArchived ? (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault();
                                            onUnarchive?.(meeting.id);
                                        }}
                                        className="text-zinc-300 hover:text-white"
                                    >
                                        <ArchiveRestore className="w-4 h-4 mr-2" />
                                        Unarchive
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.preventDefault();
                                            onArchive?.(meeting.id);
                                        }}
                                        className="text-zinc-300 hover:text-white"
                                    >
                                        <Archive className="w-4 h-4 mr-2" />
                                        Archive
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator className="bg-zinc-800" />
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onDelete(meeting.id);
                                    }}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
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
