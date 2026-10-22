'use client';

/**
 * Observation lifecycle for one meeting close (spec-08).
 *
 * Reload, navigation, and a dropped poll all converge on the same durable
 * GET; none of them starts or resumes generation. When the operation
 * reaches a settled stage the canonical meeting and turn reads are
 * refreshed once, so the UI reflects committed messages, cancelled turns,
 * and the final lifecycle status without a second ending.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useClosing } from './closing-queries';
import {
    isPollingClosingStage,
    isSettledClosingStage,
    type ClosingStage,
    type ClosingView,
} from './closing-decoders';
import { meetingKeys } from './keys';
import { turnKeys } from './turn-keys';

export interface UseClosingObservationOptions {
    meetingId: string;
    enabled?: boolean;
    /** Called once per settled stage, including a reloaded snapshot. */
    onSettled?: (view: ClosingView) => void;
}

export interface UseClosingObservationResult {
    closing: ClosingView | undefined;
    /** True while a close is actively advancing on the server. */
    isObserving: boolean;
    isSettled: boolean;
    isLoading: boolean;
    error: Error | null;
    /** Manual re-read after a local interruption; never a new close. */
    resume: () => void;
}

export function useClosingObservation({
    meetingId,
    enabled = true,
    onSettled,
}: UseClosingObservationOptions): UseClosingObservationResult {
    const queryClient = useQueryClient();
    const query = useClosing(meetingId, enabled);
    const settledStage = useRef<ClosingStage | null>(null);
    const settledCallback = useRef(onSettled);
    settledCallback.current = onSettled;

    const view = query.data;
    const stage = view?.stage ?? null;

    useEffect(() => {
        if (!view || !stage || !isSettledClosingStage(stage)) return;
        if (settledStage.current === stage) return;
        settledStage.current = stage;

        // Committed effects live in canonical reads, not this snapshot.
        void queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) });
        void queryClient.invalidateQueries({ queryKey: turnKeys.list(meetingId) });
        settledCallback.current?.(view);
    }, [meetingId, queryClient, stage, view]);

    return {
        closing: view,
        isObserving: isPollingClosingStage(stage),
        isSettled: isSettledClosingStage(stage),
        isLoading: query.isPending,
        error: query.error,
        resume: () => {
            void query.refetch();
        },
    };
}
