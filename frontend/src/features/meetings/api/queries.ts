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
import type {
    Consensus,
    ContextStats,
    Disagreement,
    Meeting,
    MeetingWithParticipants,
} from './decoders';
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

export function useMeetingDisagreements(
    meetingId: string
): UseQueryResult<Disagreement[], Error> {
    return useQuery({
        queryKey: meetingKeys.disagreements(meetingId),
        queryFn: ({ signal }) => meetingClient.disagreements(meetingId, { signal }),
        enabled: meetingId.length > 0,
    });
}

export function useMeetingConsensus(meetingId: string): UseQueryResult<Consensus[], Error> {
    return useQuery({
        queryKey: meetingKeys.consensus(meetingId),
        queryFn: ({ signal }) => meetingClient.consensus(meetingId, { signal }),
        enabled: meetingId.length > 0,
    });
}

export function useMeetingContextStats(
    meetingId: string
): UseQueryResult<ContextStats, Error> {
    return useQuery({
        queryKey: meetingKeys.contextStats(meetingId),
        queryFn: ({ signal }) => meetingClient.contextStats(meetingId, { signal }),
        enabled: meetingId.length > 0,
    });
}
