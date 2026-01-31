'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useMeetingStore } from '@/stores/meetingStore';
import { RightPanel } from '@/components/layout/RightPanel';
import { ChatArea } from '@/components/chat/ChatArea';

export default function MeetingRoomPage() {
    const params = useParams();
    const meetingId = params.id as string;

    const { currentMeeting, loadMeeting, isLoading } = useMeetingStore();

    useEffect(() => {
        if (meetingId) {
            loadMeeting(meetingId);
        }
    }, [meetingId, loadMeeting]);

    if (isLoading && !currentMeeting) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
        );
    }

    return (
        <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="border-b border-zinc-800 px-4 py-3 flex items-center gap-4 shrink-0">
                <Link
                    href="/meetings"
                    className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-zinc-800"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-lg font-semibold text-white">
                        {currentMeeting?.name || 'Meeting Room'}
                    </h1>
                    {currentMeeting?.agenda && (
                        <p className="text-xs text-zinc-500 truncate max-w-md">
                            {currentMeeting.agenda}
                        </p>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Chat Area */}
                <ChatArea />

                {/* Right Panel */}
                <RightPanel />
            </div>
        </div>
    );
}
