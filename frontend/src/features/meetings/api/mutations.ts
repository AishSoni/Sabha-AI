'use client';

/**
 * Command mutations for the meetings feature (spec-05).
 *
 * The deliberate cache policy:
 * - create seeds the freshly-created detail entry from the command response
 *   and invalidates the list identity;
 * - archive and unarchive revise the cached detail status (the server
 *   confirms the flip before the cache changes) and invalidate the list;
 * - delete drops the detail entry entirely and invalidates the list;
 * - retries stay off (app provider defaults) — a failed paid or stateful
 *   command waits for explicit user intent before replaying.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MeetingWithParticipants } from './decoders';
import { meetingClient, type MeetingCreateInput } from './client';
import { meetingKeys } from './keys';

export function useCreateMeeting() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: MeetingCreateInput) => meetingClient.create(input),
        onSuccess: (created: MeetingWithParticipants) => {
            queryClient.setQueryData(meetingKeys.detail(created.id), created);
            queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
        },
    });
}

export function useArchiveMeeting() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (meetingId: string) => meetingClient.archive(meetingId),
        onSuccess: (_result: void, meetingId: string) => {
            queryClient.setQueryData<MeetingWithParticipants>(
                meetingKeys.detail(meetingId),
                (cached) => (cached ? { ...cached, status: 'archived' } : cached)
            );
            queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
        },
    });
}

export function useUnarchiveMeeting() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (meetingId: string) => meetingClient.unarchive(meetingId),
        onSuccess: (_result: void, meetingId: string) => {
            // Unarchive only clears the archive overlay; the server keeps the
            // lifecycle status (an ended meeting stays ended). Refetch instead
            // of guessing "active" from the command.
            queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) });
            queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
        },
    });
}

export function useDeleteMeeting() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (meetingId: string) => meetingClient.remove(meetingId),
        onSuccess: (_result: void, meetingId: string) => {
            // A deleted meeting must not leave a stale detail entry behind.
            queryClient.removeQueries({ queryKey: meetingKeys.detail(meetingId) });
            queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
        },
    });
}
