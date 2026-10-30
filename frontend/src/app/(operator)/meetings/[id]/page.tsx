'use client';

import { useParams } from 'next/navigation';
import { MeetingRoom } from '@/features/meetings';
import { LiveMeetingsRuntimeProvider } from '@/features/meetings/runtime/live';

export default function MeetingRoomPage() {
    const params = useParams();
    const meetingId = typeof params.id === 'string' ? params.id : '';
    return (
        <LiveMeetingsRuntimeProvider>
            <MeetingRoom meetingId={meetingId} />
        </LiveMeetingsRuntimeProvider>
    );
}
