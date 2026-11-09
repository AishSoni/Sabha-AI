'use client';

/**
 * The create-meeting pipeline (spec-05, spec-36 T03/T04).
 *
 * Owns one lifecycle so the screens stay thin:
 * - the meeting row is created exactly once per committed configuration; one
 *   stable request key makes a lost response recoverable without a clone;
 * - the submitted title/context/roster are frozen for the life of the
 *   intent, so later visible edits can never be silently discarded;
 * - every staged file carries its own submission key. A retry reuses the key,
 *   so the server replays the original admission instead of duplicating or
 *   overwriting a different intent;
 * - files staged after the meeting exists join the same upload pump; nothing
 *   is lost and navigation waits until all intended work is accounted for.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRequestKey } from '@/shared/api/request-key';
import { isApiError } from '@/shared/api/errors';
import { useCreateMeeting } from '../api/mutations';
import { useUploadMeetingDocument, type UploadReceipt } from '@/features/knowledge';

export interface MeetingUploadDraft {
    /** Stable identity for this one deliberate upload intent. */
    requestKey: string;
    file: File;
    status: 'pending' | 'uploading' | 'uploaded' | 'failed';
    error: string | null;
    documentId: string | null;
    operationId: string | null;
    revisionId: string | null;
}

export interface MeetingCreationInput {
    title: string;
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

function isInFlight(item: MeetingUploadDraft): boolean {
    return item.status === 'pending' || item.status === 'uploading';
}

/**
 * A definite admission rejection means no meeting row can exist for this
 * attempt, so its intent may be replaced. Network ambiguity, 5xx, 408, 409,
 * and 429 must stay locked: the server may already hold the meeting.
 */
function isDefiniteRejection(err: unknown): boolean {
    if (!isApiError(err) || err.status === null) return false;
    return (
        err.status >= 400 &&
        err.status < 500 &&
        err.status !== 408 &&
        err.status !== 409 &&
        err.status !== 429
    );
}

export function useMeetingCreation() {
    const router = useRouter();
    const createMeetingMutation = useCreateMeeting();
    const uploadDocument = useUploadMeetingDocument();

    const [isCreating, setIsCreating] = useState(false);
    const [uploads, setUploads] = useState<MeetingUploadDraft[]>([]);
    const [committedConfig, setCommittedConfig] = useState<MeetingCreationInput | null>(null);
    const [createdMeetingId, setCreatedMeetingId] = useState<string | null>(null);
    const [creationError, setCreationError] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [navigationDone, setNavigationDone] = useState(false);

    // Refs, not render state, own the one-shot guarantees: a second click can
    // land before React re-renders the disabled button, and the upload pump
    // must reconcile against the latest item set across awaits.
    const workInFlight = useRef(false);
    const navigationStarted = useRef(false);
    const retainedMeetingId = useRef<string | null>(null);
    const committedConfigRef = useRef<MeetingCreationInput | null>(null);
    const meetingRequestKey = useRef<string | null>(null);
    const uploadsRef = useRef<MeetingUploadDraft[]>([]);
    const pumpPromise = useRef<Promise<boolean> | null>(null);

    const rememberCommit = (input: MeetingCreationInput): MeetingCreationInput => {
        const committed: MeetingCreationInput = {
            title: input.title,
            context: input.context,
            personaIds: [...input.personaIds],
        };
        committedConfigRef.current = committed;
        setCommittedConfig(committed);
        return committed;
    };

    const updateUploads = (update: (prev: MeetingUploadDraft[]) => MeetingUploadDraft[]) => {
        const next = update(uploadsRef.current);
        uploadsRef.current = next;
        setUploads(next);
    };

    const navigateOnce = (meetingId: string) => {
        if (navigationStarted.current) return;
        navigationStarted.current = true;
        setNavigationDone(true);
        router.push(`/meetings/${meetingId}`);
    };

    /**
     * Uploads every pending item, including items staged while a batch is in
     * flight, in stable-intent batches. Failures stay failed until the user
     * retries them; they never trigger a second upload attempt on their own.
     * Returns true only when every current item has an accepted receipt.
     */
    const pumpUploads = (meetingId: string): Promise<boolean> => {
        if (pumpPromise.current) return pumpPromise.current;

        const run = (async () => {
            for (;;) {
                const targets = uploadsRef.current.filter(
                    (item) => item.status === 'pending'
                );
                if (targets.length === 0) break;

                const targetKeys = new Set(targets.map((item) => item.requestKey));
                updateUploads((prev) =>
                    prev.map((item) =>
                        targetKeys.has(item.requestKey)
                            ? { ...item, status: 'uploading', error: null }
                            : item
                    )
                );

                const results = await Promise.allSettled(
                    targets.map((item) =>
                        uploadDocument.mutateAsync({
                            file: item.file,
                            meetingId,
                            requestKey: item.requestKey,
                        })
                    )
                );

                // Reconcile by submission key, not File identity: two uploads
                // may carry the same bytes while remaining separate intents.
                const outcome = new Map(
                    targets.map((item, index) => [item.requestKey, results[index]] as const)
                );
                updateUploads((prev) =>
                    prev.map((item) => {
                        const result = outcome.get(item.requestKey);
                        if (!result) return item;
                        if (result.status === 'fulfilled') {
                            return { ...item, ...accepted(result.value) };
                        }
                        return {
                            ...item,
                            status: 'failed',
                            error: (result.reason as Error)?.message ?? 'Upload failed',
                        };
                    })
                );
            }

            const current = uploadsRef.current;
            const failed = current.filter((item) => item.status === 'failed').length;
            if (failed > 0) {
                setUploadError(
                    `${failed} of ${current.length} files need attention. The meeting was created; retry them or continue without them.`
                );
            } else {
                setUploadError(null);
            }
            return current.every((item) => item.status === 'uploaded');
        })();

        pumpPromise.current = run;
        void run.finally(() => {
            if (pumpPromise.current === run) pumpPromise.current = null;
        });
        return run;
    };

    const stageFiles = (files: FileList | File[]) => {
        const incoming: MeetingUploadDraft[] = Array.from(files).map((file) => ({
            requestKey: createRequestKey('upload'),
            file,
            status: 'pending' as const,
            error: null,
            documentId: null,
            operationId: null,
            revisionId: null,
        }));
        updateUploads((prev) => [...prev, ...incoming]);

        const meetingId = retainedMeetingId.current;
        if (meetingId) {
            void pumpUploads(meetingId).then((everyFileAccepted) => {
                if (everyFileAccepted) navigateOnce(meetingId);
            });
        }
    };

    const removeUpload = (index: number) => {
        const item = uploadsRef.current[index];
        // Only work the server has never seen may be withdrawn. An uploading
        // or accepted file cannot be pretend-cancelled from the browser.
        if (!item || item.status !== 'pending') return;
        updateUploads((prev) => prev.filter((_, i) => i !== index));
    };

    const createMeeting = async (input: MeetingCreationInput): Promise<void> => {
        if (workInFlight.current) return;
        workInFlight.current = true;
        setIsCreating(true);
        setCreationError(null);
        let meetingId = retainedMeetingId.current;
        try {
            // Freeze the committed configuration on the first submission. A
            // later attempt retries this exact intent; visible edits cannot
            // silently diverge from the created meeting.
            const config = committedConfigRef.current ?? rememberCommit(input);

            if (!meetingId) {
                meetingRequestKey.current ??= createRequestKey('meeting');
                const meeting = await createMeetingMutation.mutateAsync({
                    name: config.title,
                    agenda: config.context,
                    personaIds: config.personaIds,
                    requestKey: meetingRequestKey.current,
                });
                meetingId = meeting.id ?? null;
                retainedMeetingId.current = meetingId;
                setCreatedMeetingId(meetingId);
            }
            if (!meetingId) {
                throw new Error('The meeting service did not return a meeting id.');
            }

            const everyFileAccepted = await pumpUploads(meetingId);
            if (everyFileAccepted) navigateOnce(meetingId);
        } catch (err) {
            console.error('Failed to create meeting:', err);
            setCreationError(`Failed to create the meeting: ${(err as Error).message}`);
            if (!meetingId && isDefiniteRejection(err)) {
                // Nothing was admitted. Unlock so the director can correct
                // validation errors; the next submit is a genuinely new intent.
                committedConfigRef.current = null;
                setCommittedConfig(null);
                meetingRequestKey.current = null;
            }
        } finally {
            workInFlight.current = false;
            setIsCreating(false);
        }
    };

    const retryUploads = async () => {
        const meetingId = retainedMeetingId.current;
        if (!meetingId || workInFlight.current) return;
        workInFlight.current = true;
        setIsCreating(true);
        try {
            await pumpPromise.current;
            if (!uploadsRef.current.some((item) => item.status === 'failed')) return;

            updateUploads((prev) =>
                prev.map((item) =>
                    item.status === 'failed'
                        ? { ...item, status: 'pending', error: null }
                        : item
                )
            );
            const everyFileAccepted = await pumpUploads(meetingId);
            if (everyFileAccepted) navigateOnce(meetingId);
        } finally {
            workInFlight.current = false;
            setIsCreating(false);
        }
    };

    /**
     * Explicitly open the created meeting while failed uploads remain. This
     * is offered only when nothing is pending or uploading: every intended
     * file is then either accepted or visibly failed, never unaccounted for.
     */
    const continueToMeeting = () => {
        const meetingId = retainedMeetingId.current;
        if (!meetingId || navigationStarted.current) return;
        if (uploadsRef.current.some(isInFlight) || pumpPromise.current) return;
        navigateOnce(meetingId);
    };

    const uploadedCount = uploads.filter((item) => item.status === 'uploaded').length;
    const failedCount = uploads.filter((item) => item.status === 'failed').length;
    const inFlightCount = uploads.filter(isInFlight).length;
    const canContinue = Boolean(
        createdMeetingId &&
            !navigationDone &&
            failedCount > 0 &&
            inFlightCount === 0 &&
            !isCreating
    );
    const partialNotice = createdMeetingId && uploads.length > 0 && (failedCount > 0 || inFlightCount > 0)
        ? `Meeting created — ${uploadedCount} of ${uploads.length} files accepted${failedCount > 0 ? `, ${failedCount} need attention` : ''}.`
        : null;

    return {
        isCreating,
        uploads,
        committedConfig,
        configLocked: committedConfig !== null,
        createdMeetingId,
        creationError,
        uploadError,
        navigationDone,
        canContinue,
        partialNotice,
        stageFiles,
        removeUpload,
        createMeeting,
        retryUploads,
        continueToMeeting,
    };
}
