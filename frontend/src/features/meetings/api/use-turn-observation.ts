'use client';

/**
 * Observation lifecycle for one durable turn (spec-07).
 *
 * Observation is read-only: it never submits inference. Navigation aborts the
 * stream, and a remount resumes from the persisted sequence cursor. EOF is a
 * local observation interruption, not a server-side outcome; execution keeps
 * running and durable status remains authoritative.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { turnClient } from './turn-client';
import {
    isTerminalTurnStatus,
    type TurnOperation,
    type TurnStatus,
} from './turn-decoders';
import { meetingKeys } from './keys';
import {
    localObservationInterruption,
    type TurnEvent,
} from './turn-events';
import {
    turnProjectionKey,
    useTurnProjection,
    useTurnProjectionStore,
    type TurnProjection,
} from './turn-projection';
import { turnKeys } from './turn-keys';

export interface UseTurnObservationOptions {
    meetingId: string;
    operation: TurnOperation | null | undefined;
    enabled?: boolean;
    /** Called once per terminal transition, including a terminal status read. */
    onTerminal?: (event: TurnEvent | null, status: TurnStatus) => void;
}

export interface UseTurnObservationResult {
    projection: TurnProjection | undefined;
    isObserving: boolean;
    /** Re-attach after a local EOF without submitting generation. */
    resume: () => void;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException
        ? error.name === 'AbortError'
        : typeof error === 'object' &&
              error !== null &&
              'name' in error &&
              (error as { name?: string }).name === 'AbortError';
}

export function useTurnObservation({
    meetingId,
    operation,
    enabled = true,
    onTerminal,
}: UseTurnObservationOptions): UseTurnObservationResult {
    const queryClient = useQueryClient();
    const projection = useTurnProjection(meetingId, operation?.operation_id ?? '');
    const [epoch, setEpoch] = useState(0);
    const [isObserving, setIsObserving] = useState(false);
    const handledTerminal = useRef<string | null>(null);
    const terminalCallback = useRef(onTerminal);
    terminalCallback.current = onTerminal;

    const operationId = operation?.operation_id ?? '';
    const status = operation?.status;
    const scopeKey = operationId
        ? turnProjectionKey({ meetingId, operationId })
        : '';

    const settle = useCallback(
        (event: TurnEvent | null, terminalStatus: TurnStatus) => {
            if (!operationId || handledTerminal.current === scopeKey) return;
            handledTerminal.current = scopeKey;

            queryClient.setQueryData<TurnOperation>(
                turnKeys.detail(meetingId, operationId),
                (current) => (current ? { ...current, status: terminalStatus } : current)
            );
            queryClient.setQueryData<TurnOperation[]>(
                turnKeys.list(meetingId),
                (current) =>
                    current?.map((item) =>
                        item.operation_id === operationId
                            ? { ...item, status: terminalStatus }
                            : item
                    )
            );
            // Canonical messages, costs, and effects have committed by the
            // time a terminal event is published. Refresh the meeting read.
            void queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) });
            void queryClient.invalidateQueries({ queryKey: turnKeys.list(meetingId) });
            terminalCallback.current?.(event, terminalStatus);
        },
        [meetingId, operationId, queryClient, scopeKey]
    );

    // A terminal status read is enough to reconcile even if SSE never
    // connected. This is also the path that notices completion after EOF.
    useEffect(() => {
        if (!operation || !isTerminalTurnStatus(operation.status)) return;
        settle(null, operation.status);
    }, [operation, settle]);

    useEffect(() => {
        if (!enabled || !operationId || !status || isTerminalTurnStatus(status)) {
            setIsObserving(false);
            return;
        }

        const scope = { meetingId, operationId };
        const key = turnProjectionKey(scope);
        const store = useTurnProjectionStore.getState();
        store.ensure(scope, status);

        let cancelled = false;
        let controller: AbortController | null = null;

        const observe = async () => {
            const after =
                useTurnProjectionStore.getState().projections[key]?.lastSequence ?? 0;
            controller = new AbortController();
            setIsObserving(true);
            try {
                for await (const event of turnClient.observe(meetingId, operationId, {
                    after,
                    signal: controller.signal,
                })) {
                    if (cancelled) return;
                    useTurnProjectionStore.getState().apply(scope, event);
                    if (
                        event.type === 'interrupted' &&
                        event.eventId === 'local-interruption'
                    ) {
                        // Surface the local interruption and stop. Work
                        // continues server-side; `resume()` or a remount
                        // reattaches from the last persisted sequence.
                        return;
                    }
                    if (
                        event.type === 'done' ||
                        event.type === 'error' ||
                        event.type === 'interrupted' ||
                        event.type === 'cancelled'
                    ) {
                        const terminalProjection =
                            useTurnProjectionStore.getState().projections[key];
                        settle(event, terminalProjection?.status ?? 'completed');
                        return;
                    }
                }
            } catch (error) {
                if (cancelled || controller.signal.aborted || isAbortError(error)) return;
                useTurnProjectionStore
                    .getState()
                    .apply(scope, localObservationInterruption(after));
            } finally {
                if (!cancelled) setIsObserving(false);
            }
        };

        void observe();

        return () => {
            cancelled = true;
            controller?.abort();
        };
    }, [enabled, epoch, meetingId, operationId, settle, status]);

    const resume = useCallback(() => {
        if (!operationId) return;
        // A resume is observation-only. It never calls the submit mutation.
        setEpoch((value) => value + 1);
    }, [operationId]);

    return { projection, isObserving, resume };
}
