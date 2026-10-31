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
import {
    isTerminalTurnStatus,
    type TurnOperation,
    type TurnStatus,
} from './turn-decoders';
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
import type { MeetingsRuntime } from '../runtime/contract';
import {
    combineSignals,
    projectionScopeId as runtimeProjectionScopeId,
} from '@/shared/runtime/scope';

export interface UseTurnObservationOptions {
    meetingId: string;
    operation: TurnOperation | null | undefined;
    enabled?: boolean;
    /** Recorded playback pacing; default 1x. */
    speed?: 1 | 2;
    /** Composed runtime graph; the room always supplies live or recorded. */
    runtime: MeetingsRuntime;
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
    runtime,
    speed = 1,
    onTerminal,
}: UseTurnObservationOptions): UseTurnObservationResult {
    const queryClient = useQueryClient();
    const scopeId = runtimeProjectionScopeId(runtime.scope);
    const projection = useTurnProjection(
        meetingId,
        operation?.operation_id ?? '',
        scopeId
    );
    const [epoch, setEpoch] = useState(0);
    const [isObserving, setIsObserving] = useState(false);
    const handledTerminal = useRef<string | null>(null);
    const settling = useRef(false);
    const terminalCallback = useRef(onTerminal);
    terminalCallback.current = onTerminal;

    const operationId = operation?.operation_id ?? '';
    const status = operation?.status;
    const scopeKey = operationId
        ? turnProjectionKey({ scopeId, meetingId, operationId })
        : '';

    const settle = useCallback(
        (event: TurnEvent | null, terminalStatus: TurnStatus) => {
            if (!operationId || handledTerminal.current === scopeKey) return;
            if (settling.current) return;

            const finish = () => {
                if (handledTerminal.current === scopeKey) return;
                handledTerminal.current = scopeKey;

                const detailKey = runtime.keys.turnDetail(meetingId, operationId);
                const listKey = runtime.keys.turnList(meetingId);
                const meetingKey = runtime.keys.meetingDetail(meetingId);
                queryClient.setQueryData<TurnOperation>(
                    detailKey,
                    (current) =>
                        current ? { ...current, status: terminalStatus } : current
                );
                queryClient.setQueryData<TurnOperation[]>(
                    listKey,
                    (current) =>
                        current?.map((item) =>
                            item.operation_id === operationId
                                ? { ...item, status: terminalStatus }
                                : item
                        )
                );
                // Canonical messages, costs, and effects have committed by the
                // time a terminal event is published. Refresh the meeting read.
                void queryClient.invalidateQueries({ queryKey: meetingKey });
                void queryClient.invalidateQueries({ queryKey: listKey });
                terminalCallback.current?.(event, terminalStatus);
            };

            const hook = runtime.settlement;
            if (!hook) {
                finish();
                return;
            }

            settling.current = true;
            void (async () => {
                try {
                    await hook.beforeTerminal({
                        meetingId,
                        operationId,
                        event,
                        status: terminalStatus,
                    });
                } catch {
                    // Keep the provisional projection; a later settlement
                    // attempt may still install the canonical checkpoint.
                    settling.current = false;
                    return;
                }
                settling.current = false;
                finish();
            })();
        },
        [meetingId, operationId, queryClient, runtime, scopeKey]
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

        const scope = { scopeId, meetingId, operationId };
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
                for await (const event of runtime.turns.observe(meetingId, operationId, {
                    after,
                    speed,
                    signal: combineSignals(runtime.signal, controller.signal),
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
    }, [enabled, epoch, meetingId, operationId, runtime, scopeId, settle, speed, status]);

    const resume = useCallback(() => {
        if (!operationId) return;
        // A resume is observation-only. It never calls the submit mutation.
        setEpoch((value) => value + 1);
    }, [operationId]);

    return { projection, isObserving, resume };
}
