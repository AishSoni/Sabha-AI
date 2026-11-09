'use client';

/**
 * Closing reads (spec-08).
 *
 * The progress GET polls quickly while an operation is genuinely advancing and
 * checks slowly while an idle live room is open, so a close started elsewhere
 * becomes visible without submitting anything. A failed close is settled for
 * observation purposes: it will not change without the explicit retry command,
 * so polling it would only hide that fact behind a spinner. Recorded replays
 * never poll.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MeetingsRuntime } from '../runtime/contract';
import { combineSignals } from '@/shared/runtime/scope';
import {
    isPollingClosingStage,
    type ClosingCapability,
    type ClosingStage,
    type ClosingView,
} from './closing-decoders';
import { closingKeys } from './closing-keys';

const CLOSING_POLL_MS = 3_000;
const CLOSING_IDLE_POLL_MS = 10_000;

export function closingRefetchInterval(
    stage: ClosingStage | null | undefined,
    failed: boolean,
    replay: boolean
): number | false {
    if (isPollingClosingStage(stage)) return CLOSING_POLL_MS;
    if (!replay && !stage && !failed) return CLOSING_IDLE_POLL_MS;
    return false;
}

export function useClosing(
    meetingId: string,
    enabled: boolean,
    runtime: MeetingsRuntime
): UseQueryResult<ClosingView, Error> {
    return useQuery({
        queryKey: runtime.keys.closing(meetingId),
        queryFn: async ({ signal }) =>
            runtime.reads.closing(
                meetingId,
                combineSignals(runtime.signal, signal)
            ),
        enabled: enabled && meetingId.length > 0,
        refetchInterval: (query) =>
            closingRefetchInterval(
                query.state.data?.stage,
                query.state.status === 'error',
                Boolean(runtime.replay)
            ),
    });
}

export function useClosingCapability(
    meetingId: string,
    enabled: boolean,
    runtime: MeetingsRuntime
): UseQueryResult<ClosingCapability, Error> {
    return useQuery({
        queryKey:
            runtime.keys.closingCapability?.(meetingId) ??
            closingKeys.capability(meetingId),
        queryFn: async ({ signal }) => {
            if (!runtime.reads.closingCapability) {
                throw new Error('Closing credential preflight is unavailable.');
            }
            return runtime.reads.closingCapability(
                meetingId,
                combineSignals(runtime.signal, signal)
            );
        },
        enabled:
            enabled &&
            meetingId.length > 0 &&
            Boolean(runtime.reads.closingCapability),
    });
}
