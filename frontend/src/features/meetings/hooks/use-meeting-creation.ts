'use client';

/**
 * The create-meeting pipeline (spec-05).
 *
 * Owns one lifecycle so the screens stay thin:
 * - the meeting row is created exactly once; the retained id means an upload
 *   retry never creates a clone;
 * - documents upload through the knowledge capability with explicit per-file
 *   staging so a failed upload never discards the created meeting;
 * - navigation happens once, only after every staged file reached an
 *   accepted receipt (or when there were no files to upload).
 */
import { useRef, useState } from 'react';
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

    // Refs, not render state, own the one-shot guarantees: a second click can
    // land before React re-renders the disabled button.
    const workInFlight = useRef(false);
    const navigationStarted = useRef(false);
    const retainedMeetingId = useRef<string | null>(null);

    const navigateOnce = (meetingId: string) => {
        if (navigationStarted.current) return;
        navigationStarted.current = true;
        setNavigationDone(true);
        router.push(`/meetings/${meetingId}`);
    };

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
     * Uploads every file that has not reached the server yet. Returns true
     * only when every staged file now has an accepted receipt: no files at
     * all is a complete set, not an early exit.
     */
    const runPendingUploads = async (meetingId: string): Promise<boolean> => {
        const targets = uploads.filter((item) => item.status !== 'uploaded');
        if (targets.length === 0) {
            setUploadError(null);
            return true;
        }

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
            return false;
        }

        return true;
    };

    const createMeeting = async (input: MeetingCreationInput): Promise<void> => {
        if (workInFlight.current) return;
        workInFlight.current = true;
        setIsCreating(true);
        setCreationError(null);
        try {
            // The meeting row exists exactly once: retries after a failed
            // upload resume from the retained id instead of creating a clone.
            let meetingId = createdMeetingId ?? retainedMeetingId.current;
            if (!meetingId) {
                const meeting = await createMeetingMutation.mutateAsync({
                    name: input.agenda,
                    agenda: input.context,
                    personaIds: input.personaIds,
                });
                meetingId = meeting.id ?? null;
                retainedMeetingId.current = meetingId;
                setCreatedMeetingId(meetingId);
            }
            if (!meetingId) {
                throw new Error('The meeting service did not return a meeting id.');
            }

            const everyFileAccepted = await runPendingUploads(meetingId);
            if (everyFileAccepted) navigateOnce(meetingId);
        } catch (err) {
            console.error('Failed to create meeting:', err);
            setCreationError(`Failed to create the meeting: ${(err as Error).message}`);
        } finally {
            workInFlight.current = false;
            setIsCreating(false);
        }
    };

    const retryUploads = async () => {
        const meetingId = createdMeetingId ?? retainedMeetingId.current;
        if (!meetingId || workInFlight.current) return;
        workInFlight.current = true;
        setIsCreating(true);
        try {
            const everyFileAccepted = await runPendingUploads(meetingId);
            if (everyFileAccepted) navigateOnce(meetingId);
        } finally {
            workInFlight.current = false;
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
