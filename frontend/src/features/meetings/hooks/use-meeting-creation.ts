'use client';

/**
 * The create-meeting pipeline (spec-05).
 *
 * Owns one lifecycle so the screens stay thin:
 * - the meeting row is created exactly once; the retained id means an upload
 *   retry never creates a clone;
 * - documents upload through the knowledge capability with explicit per-file
 *   staging so a failed upload never discards the created meeting;
 * - navigation happens once, only after every file reached the server.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateMeeting } from '../api/mutations';
import { useRetryIngestion, useUploadMeetingDocument, type UploadReceipt } from '@/features/knowledge';

export interface MeetingUploadDraft {
    file: File;
    status: 'pending' | 'uploading' | 'uploaded' | 'failed';
    error: string | null;
    documentId: string | null;
    operationId: string | null;
    revisionId: string | null;
}

export interface MeetingCreationInput {
    agenda: string;
    context: string;
    personaIds: string[];
}

function accepted(receipt: UploadReceipt): Pick<
    MeetingUploadDraft,
    'status' | 'error' | 'documentId' | 'operationId' | 'revisionId'
> {
    return {
        // Accepted is not ready: pending receipts are observed by the meeting
        // room, never re-uploaded. The retained operation id makes retry safe.
        status: 'uploaded',
        error: null,
        documentId: receipt.documentId,
        operationId: receipt.operationId,
        revisionId: receipt.revisionId,
    };
}

export function useMeetingCreation() {
    const router = useRouter();
    const createMeetingMutation = useCreateMeeting();
    const uploadDocument = useUploadMeetingDocument();

    const [isCreating, setIsCreating] = useState(false);
    const [uploads, setUploads] = useState<MeetingUploadDraft[]>([]);
    const [createdMeetingId, setCreatedMeetingId] = useState<string | null>(null);
    const retryIngestion = useRetryIngestion({ meetingId: createdMeetingId ?? '' });
    const [creationError, setCreationError] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [navigationDone, setNavigationDone] = useState(false);

    const stageFiles = (files: FileList | File[]) => {
        const incoming: MeetingUploadDraft[] = Array.from(files).map((file) => ({
            file,
            status: 'pending' as const,
            error: null,
            documentId: null,
            operationId: null,
            revisionId: null,
        }));
        setUploads((prev) => [...prev, ...incoming]);
    };

    const removeUpload = (index: number) => {
        setUploads(uploads.filter((_, i) => i !== index));
    };

    /**
     * Uploads every file that has not reached the server yet; returns the
     * file list attempted (for tests/telemetry).
     */
    const runPendingUploads = async (meetingId: string) => {
        const targets = uploads.filter((item) => item.status !== 'uploaded');
        if (targets.length === 0) return;

        setUploads((prev) =>
            prev.map((item) => (item.status !== 'uploaded' ? { ...item, status: 'uploading', error: null } : item))
        );
        setUploadError(null);

        const results = await Promise.allSettled(
            targets.map((item) =>
                item.operationId
                    ? retryIngestion.mutateAsync(item.operationId)
                    : uploadDocument.mutateAsync({ file: item.file, meetingId })
            )
        );

        // Reconcile by file identity so an out-of-order late success still lands.
        const outcome = new Map<File, PromiseSettledResult<UploadReceipt>>();
        targets.forEach((item, i) => outcome.set(item.file, results[i]));

        setUploads((prev) =>
            prev.map((item) => {
                if (item.status === 'uploaded') return item;
                const result = outcome.get(item.file);
                if (!result) return item;
                if (result.status === 'fulfilled') return { ...item, ...accepted(result.value) };
                return {
                    ...item,
                    status: 'failed',
                    error: (result.reason as Error)?.message ?? 'Upload failed',
                };
            })
        );

        if (results.some((r) => r.status === 'rejected')) {
            const failedCount = results.filter((r) => r.status === 'rejected').length;
            setUploadError(
                `${failedCount} of ${targets.length} files failed to upload. You can retry below; nothing was lost.`
            );
            return;
        }

        // Everything reached the server — navigate to the meeting once.
        if (!navigationDone) {
            setNavigationDone(true);
            router.push(`/meetings/${meetingId}`);
        }
    };

    const createMeeting = async (input: MeetingCreationInput): Promise<void> => {
        setIsCreating(true);
        setCreationError(null);
        try {
            // The meeting row exists exactly once: retries after a failed
            // upload resume from the retained id instead of creating a clone.
            let meetingId = createdMeetingId;
            if (!meetingId) {
                const meeting = await createMeetingMutation.mutateAsync({
                    name: input.agenda,
                    agenda: input.context,
                    personaIds: input.personaIds,
                });
                meetingId = meeting.id ?? null;
                setCreatedMeetingId(meetingId);
            }
            await runPendingUploads(meetingId);
        } catch (err) {
            console.error('Failed to create meeting:', err);
            setCreationError(`Failed to create the meeting: ${(err as Error).message}`);
        } finally {
            setIsCreating(false);
        }
    };

    const retryUploads = async () => {
        if (!createdMeetingId) return;
        setIsCreating(true);
        try {
            await runPendingUploads(createdMeetingId);
        } finally {
            setIsCreating(false);
        }
    };

    return {
        isCreating,
        uploads,
        createdMeetingId,
        creationError,
        uploadError,
        navigationDone,
        stageFiles,
        removeUpload,
        createMeeting,
        retryUploads,
    };
}
