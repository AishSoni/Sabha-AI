'use client';

/**
 * Canonical reads for the meetings feature (spec-05).
 *
 * One query identity per meeting detail and one for the shared list. The
 * detail read only fires for a real meeting id so a half-rendered or
 * pre-navigation route cannot fire a request for nobody. No read here ever
 * submits inference or issues a command.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Meeting, MeetingWithParticipants } from './decoders';
import { meetingClient } from './client';
import { meetingKeys } from './keys';

export function useMeetingList(): UseQueryResult<Meeting[], Error> {
    return useQuery({
        queryKey: meetingKeys.list(),
        queryFn: () => meetingClient.list(),
    });
}

export function useMeeting(meetingId: string): UseQueryResult<MeetingWithParticipants, Error> {
    return useQuery({
        queryKey: meetingKeys.detail(meetingId),
        queryFn: ({ signal }) => meetingClient.get(meetingId, { signal }),
        // Deliberate: an empty id is a not-yet-navigated screen, not a request.
        enabled: meetingId.length > 0,
    });
}
