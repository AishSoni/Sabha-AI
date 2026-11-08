'use client';

/**
 * Meeting-scoped controller for the durable turn queue (spec-07).
 *
 * The controller owns intent, not execution: submit creates/returns one
 * server operation, observation is read-only, and cancel is a separate
 * command. A request key survives an ambiguous submit failure so a second
 * click reconciles with the original operation instead of buying a second
 * inference run.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TurnGenerationSettings } from '../api/generation-settings';
import type { TurnOperation, TurnStatus } from '../api/turn-decoders';
import { isTerminalTurnStatus } from '../api/turn-decoders';
import type { TurnEvent } from '../api/turn-events';
import { useCancelTurn, useSubmitTurn } from '../api/turn-mutations';
import { useMeetingTurns, useTurnOperation } from '../api/turn-queries';
import { useTurnObservation } from '../api/use-turn-observation';
import type { MeetingsRuntime } from '../runtime/contract';
import { isApiError } from '@/shared/api/errors';
import { createRequestKey as newRequestKey } from '@/shared/api/request-key';

export interface MeetingTurnControllerOptions {
    meetingId: string;
    /** Composed runtime graph; the room always supplies live or recorded. */
    runtime: MeetingsRuntime;
    /** Test seam for deterministic request keys; production uses Web Crypto. */
    createRequestKey?: () => string;
    /** Called once per terminal transition, e.g. to refresh a legacy screen read. */
    onTerminal?: (event: TurnEvent | null, status: TurnStatus) => void;
}

export interface MeetingTurnController {
    operations: TurnOperation[];
    activeOperation: TurnOperation | null;
    /**
     * The operation whose projection is on screen. It remains set after the
     * queue read reports a terminal status so settlement can install the
     * canonical message before the provisional bubble disappears.
     */
    observationOperation: TurnOperation | null;
    queuedOperations: TurnOperation[];
    activeParticipantId: string | null;
    projection: ReturnType<typeof useTurnObservation>['projection'];
    isObserving: boolean;
    isSubmitting: boolean;
    cancelingOperationId: string | null;
    actionError: string | null;
    submit: (
        participantId: string,
        settings?: TurnGenerationSettings
    ) => Promise<TurnOperation | null>;
    cancel: (operationId: string) => Promise<boolean>;
    resumeObservation: () => void;
    clearActionError: () => void;
}

export function createTurnRequestKey(): string {
    return newRequestKey('turn');
}

/**
 * A deterministic 4xx answer means the server did not accept this intent, so
 * a corrected retry may use a fresh key. Network failures and 5xx responses
 * are ambiguous and must replay the same key.
 */
function isAmbiguousSubmitFailure(error: unknown): boolean {
    if (!isApiError(error)) return true;
    if (error.kind === 'network') return true;
    if (error.kind === 'aborted') return false;
    return error.status !== null && error.status >= 500;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'The turn request failed.';
}

export function useMeetingTurnController({
    meetingId,
    runtime,
    createRequestKey = createTurnRequestKey,
    onTerminal,
}: MeetingTurnControllerOptions): MeetingTurnController {
    const turns = useMeetingTurns(
        meetingId,
        meetingId.length > 0 && runtime.capabilities.turnObservation,
        runtime
    );
    const submitMutation = useSubmitTurn(runtime);
    const cancelMutation = useCancelTurn(runtime);
    const [actionError, setActionError] = useState<string | null>(null);
    const [cancelingOperationId, setCancelingOperationId] = useState<string | null>(null);
    const pendingKey = useRef<{ participantId: string; requestKey: string } | null>(null);
    const submitInFlight = useRef(false);

    const operations = turns.data ?? [];

    const activeOperation = useMemo(
        () => operations.find((operation) => !isTerminalTurnStatus(operation.status)) ?? null,
        [operations]
    );
    const queuedOperations = useMemo(
        () => operations.filter((operation) => operation.status === 'queued'),
        [operations]
    );

    const [watchedOperation, setWatchedOperation] = useState<TurnOperation | null>(null);
    const settledOperations = useRef<Set<string>>(new Set());

    // The queue read can report `completed` before the observer has settled.
    // Keep the last watched identity until its terminal callback runs; only
    // then may observation move to the next queued operation.
    useEffect(() => {
        if (!activeOperation) return;
        if (settledOperations.current.has(activeOperation.operation_id)) return;
        setWatchedOperation((current) => {
            if (!current) return activeOperation;
            if (current.operation_id === activeOperation.operation_id) {
                return activeOperation;
            }
            if (!settledOperations.current.has(current.operation_id)) return current;
            return activeOperation;
        });
    }, [activeOperation, watchedOperation]);

    const watchedId = watchedOperation?.operation_id ?? '';
    const watchedDetail = useTurnOperation(
        meetingId,
        watchedId,
        Boolean(watchedOperation) &&
            meetingId.length > 0 &&
            runtime.capabilities.turnObservation &&
            activeOperation?.operation_id !== watchedOperation?.operation_id,
        runtime
    );

    const observationOperation = useMemo(() => {
        if (!watchedOperation) return null;
        const fromList = operations.find(
            (operation) => operation.operation_id === watchedOperation.operation_id
        );
        const fromDetail =
            watchedDetail.data?.operation_id === watchedOperation.operation_id
                ? watchedDetail.data
                : null;
        // Any terminal read wins so a lost stream is reconciled from the
        // durable status even when another cache still says queued.
        const terminal = [fromList, fromDetail].find(
            (operation) => operation && isTerminalTurnStatus(operation.status)
        );
        return terminal ?? fromList ?? fromDetail ?? watchedOperation;
    }, [operations, watchedDetail.data, watchedOperation]);

    const handleObservedTerminal = useCallback(
        (event: TurnEvent | null, status: TurnStatus) => {
            const settledId = observationOperation?.operation_id;
            if (settledId) settledOperations.current.add(settledId);
            setWatchedOperation((current) =>
                current?.operation_id === settledId ? null : current
            );
            onTerminal?.(event, status);
        },
        [observationOperation?.operation_id, onTerminal]
    );

    const observation = useTurnObservation({
        meetingId,
        operation: observationOperation,
        runtime,
        onTerminal: handleObservedTerminal,
    });

    const submit = useCallback(
        async (
            participantId: string,
            settings?: TurnGenerationSettings
        ): Promise<TurnOperation | null> => {
            if (!runtime.capabilities.submitTurn) return null;
            if (!meetingId || submitInFlight.current) return null;
            submitInFlight.current = true;
            setActionError(null);

            const pending = pendingKey.current;
            const intent =
                pending && pending.participantId === participantId
                    ? pending
                    : { participantId, requestKey: createRequestKey() };
            pendingKey.current = intent;

            try {
                const operation = await submitMutation.mutateAsync({
                    meetingId,
                    participantId,
                    requestKey: intent.requestKey,
                    settings,
                });
                if (pendingKey.current?.requestKey === intent.requestKey) {
                    pendingKey.current = null;
                }
                return operation;
            } catch (error) {
                if (
                    pendingKey.current?.requestKey === intent.requestKey &&
                    !isAmbiguousSubmitFailure(error)
                ) {
                    pendingKey.current = null;
                }
                setActionError(errorMessage(error));
                return null;
            } finally {
                submitInFlight.current = false;
            }
        },
        [createRequestKey, meetingId, runtime, submitMutation]
    );

    const cancel = useCallback(
        async (operationId: string): Promise<boolean> => {
            if (!runtime.capabilities.cancelTurn) return false;
            if (!meetingId || !operationId) return false;
            setActionError(null);
            setCancelingOperationId(operationId);
            try {
                await cancelMutation.mutateAsync({ meetingId, operationId });
                return true;
            } catch (error) {
                setActionError(errorMessage(error));
                return false;
            } finally {
                setCancelingOperationId(null);
            }
        },
        [cancelMutation, meetingId, runtime]
    );

    const clearActionError = useCallback(() => setActionError(null), []);

    return {
        operations,
        activeOperation,
        observationOperation,
        queuedOperations,
        activeParticipantId: activeOperation?.participant_id ?? null,
        projection: observation.projection,
        isObserving: observation.isObserving,
        isSubmitting: submitMutation.isPending,
        cancelingOperationId,
        actionError,
        submit,
        cancel,
        resumeObservation: observation.resume,
        clearActionError,
    };
}
