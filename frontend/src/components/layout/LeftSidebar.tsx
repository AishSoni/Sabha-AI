'use client';

import { useEffect, useState } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Plus, MessageSquare, Settings } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';

interface LeftSidebarProps {
    onNewMeeting: () => void;
}

export function LeftSidebar({ onNewMeeting }: LeftSidebarProps) {
    const { meetings, currentMeeting, fetchMeetings, loadMeeting, isLoading } = useMeetingStore();

    useEffect(() => {
        fetchMeetings();
    }, [fetchMeetings]);

    return (
        <div className="w-64 h-full bg-zinc-900 border-r border-zinc-800 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800">
                <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                    Sabha
                </h1>
                <p className="text-xs text-zinc-500 mt-1">AI Advisory Board</p>
            </div>

            {/* New Meeting Button */}
            <div className="p-3">
                <Button
                    onClick={onNewMeeting}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    New Sabha
                </Button>
            </div>

            <Separator className="bg-zinc-800" />

            {/* Meetings List */}
            <ScrollArea className="flex-1 px-2">
                <div className="py-2 space-y-1">
                    {meetings.map((meeting) => (
                        <button
                            key={meeting.id}
                            onClick={() => loadMeeting(meeting.id)}
                            className={cn(
                                'w-full text-left px-3 py-2.5 rounded-lg transition-colors group',
                                currentMeeting?.id === meeting.id
                                    ? 'bg-zinc-800 text-white'
                                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 shrink-0" />
                                <span className="truncate text-sm font-medium">{meeting.name}</span>
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5 ml-6">
                                {formatRelativeTime(meeting.created_at)}
                            </p>
                        </button>
                    ))}

                    {meetings.length === 0 && !isLoading && (
                        <p className="text-center text-zinc-500 text-sm py-8">
                            No meetings yet
                        </p>
                    )}
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-zinc-800">
                <Button variant="ghost" size="sm" className="w-full justify-start text-zinc-400 hover:text-white">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                </Button>
            </div>
        </div>
    );
}
