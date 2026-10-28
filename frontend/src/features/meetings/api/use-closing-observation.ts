'use client';

/**
 * Observation lifecycle for one meeting close (spec-08, runtime-scoped spec-15).
 *
 * Reload, navigation, and a dropped poll all converge on the same durable
 * GET; none of them starts or resumes generation. When the operation
 * reaches a settled stage the canonical meeting and turn reads are
 * refreshed once, so the UI reflects committed messages, cancelled turns,
 * and the final lifecycle status without a second ending.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MeetingsRuntime } from '../runtime/contract';
import { useClosing } from './closing-queries';
import {
    isPollingClosingStage,
    isSettledClosingStage,
    type ClosingView,
} from './closing-decoders';
import { meetingKeys } from './keys';
import { turnKeys } from './turn-keys';

export interface UseClosingObservationOptions {
    meetingId: string;
    enabled?: boolean;
    runtime?: MeetingsRuntime;
    /** Called once per settled closing attempt, including a reloaded snapshot. */
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
    runtime,
    onSettled,
}: UseClosingObservationOptions): UseClosingObservationResult {
    const queryClient = useQueryClient();
    const query = useClosing(meetingId, enabled, runtime);
    const settledKey = useRef<string | null>(null);
    const settledCallback = useRef(onSettled);

    useEffect(() => {
        settledCallback.current = onSettled;
    }, [onSettled]);

    const view = query.data;
    const stage = view?.stage ?? null;
    const settlementKey =
        view?.closing_id && stage ? `${view.closing_id}:${stage}` : null;

    useEffect(() => {
        if (!settlementKey || !view || !stage) return;
        if (!isSettledClosingStage(stage)) return;
        if (settledKey.current === settlementKey) return;
        settledKey.current = settlementKey;

        // Committed effects live in canonical reads, not this snapshot.
        void queryClient.invalidateQueries({
            queryKey:
                runtime?.keys.meetingDetail(meetingId) ??
                meetingKeys.detail(meetingId),
        });
        void queryClient.invalidateQueries({
            queryKey:
                runtime?.keys.turnList(meetingId) ?? turnKeys.list(meetingId),
        });
        settledCallback.current?.(view);
    }, [meetingId, queryClient, runtime, settlementKey, stage, view]);

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
