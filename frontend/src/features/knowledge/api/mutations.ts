'use client';

/**
 * Command hooks for document uploads (spec-05).
 *
 * Uploads are stateful indexing commands: they never auto-retry. A retry is
 * always the user's explicit intent, because a replayed upload duplicates
 * indexing work the user would otherwise have to notice and clean up.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentClient } from './client';
import { documentKeys } from './keys';

export function useUploadMeetingDocument() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, meetingId }: { file: File; meetingId: string }) =>
            documentClient.upload({ file, meetingId }),
        retry: false,
        onSuccess: (_data, variables) => {
            void queryClient
                .invalidateQueries({ queryKey: documentKeys.meeting(variables.meetingId) })
                .catch(() => undefined);
        },
    });
}
