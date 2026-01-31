'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, Calendar, ArrowLeft, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, Meeting } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { CreateMeetingRoomDialog } from '@/components/CreateMeetingRoomDialog';

export default function MeetingSpacePage() {
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);

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

    const handleMeetingCreated = () => {
        loadMeetings();
        setShowCreateDialog(false);
    };

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
                    <Button
                        onClick={() => setShowCreateDialog(true)}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Meeting Room
                    </Button>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
                    </div>
                ) : meetings.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                            <MessageSquare className="w-8 h-8 text-zinc-600" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-2">No meeting rooms yet</h3>
                        <p className="text-zinc-500 mb-6">Create your first meeting room to get started</p>
                        <Button
                            onClick={() => setShowCreateDialog(true)}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Meeting Room
                        </Button>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {meetings.map((meeting) => (
                            <Link href={`/meetings/${meeting.id}`} key={meeting.id}>
                                <Card className="bg-zinc-900/50 border-zinc-800 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 cursor-pointer h-full">
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start justify-between">
                                            <CardTitle className="text-white text-lg">
                                                {meeting.name}
                                            </CardTitle>
                                            <Badge
                                                variant="secondary"
                                                className={meeting.status === 'active'
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-zinc-700 text-zinc-400'
                                                }
                                            >
                                                {meeting.status}
                                            </Badge>
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
                        ))}
                    </div>
                )}
            </main>

            {/* Create Dialog */}
            <CreateMeetingRoomDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                onCreated={handleMeetingCreated}
            />
        </div>
    );
}
