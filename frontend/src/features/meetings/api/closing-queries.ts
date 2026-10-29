'use client';

/**
 * Closing reads (spec-08).
 *
 * The progress GET polls only while an operation is genuinely advancing.
 * A failed close is settled for observation purposes: it will not change
 * without the explicit retry command, so polling it would only hide that
 * fact behind a spinner.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MeetingsRuntime } from '../runtime/contract';
import { combineSignals } from '@/shared/runtime/scope';
import { closingClient } from './closing-client';
import { isPollingClosingStage, type ClosingView } from './closing-decoders';
import { closingKeys } from './closing-keys';

const CLOSING_POLL_MS = 3_000;

export function useClosing(
    meetingId: string,
    enabled = true,
    runtime?: MeetingsRuntime
): UseQueryResult<ClosingView, Error> {
    return useQuery({
        queryKey: runtime?.keys.closing(meetingId) ?? closingKeys.detail(meetingId),
        queryFn: ({ signal }) =>
            runtime
                ? runtime.reads.closing(
                      meetingId,
                      combineSignals(runtime.signal, signal)
                  )
                : closingClient.get(meetingId, { signal }),
        enabled: enabled && meetingId.length > 0,
        refetchInterval: (query) =>
            isPollingClosingStage(query.state.data?.stage) ? CLOSING_POLL_MS : false,
    });
}
