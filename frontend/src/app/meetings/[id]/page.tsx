'use client';

import { useParams } from 'next/navigation';
import { MeetingRoom } from '@/features/meetings';

export default function MeetingRoomPage() {
    const params = useParams();
    const meetingId = typeof params.id === 'string' ? params.id : '';
    return <MeetingRoom meetingId={meetingId} />;
}
