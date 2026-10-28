'use client';

import { useParams } from 'next/navigation';
import { ReplayMeetingRoom } from '@/features/meetings/runtime/replay';

/**
 * Recorded replay route (spec-14).
 *
 * This is a composition namespace inside the same Next.js app, not a second
 * mock screen. The entry/guide UX and package selection belong to Spec 18.
 */
export default function ReplayMeetingRoomPage() {
    const params = useParams();
    const meetingId = typeof params.id === 'string' ? params.id : '';
    return <ReplayMeetingRoom meetingId={meetingId} />;
}
