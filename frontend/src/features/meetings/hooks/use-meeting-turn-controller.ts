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
import { useCallback, useMemo, useRef, useState } from 'react';
import type { TurnGenerationSettings } from '../api/turn-client';
import type { TurnOperation, TurnStatus } from '../api/turn-decoders';
import { isTerminalTurnStatus } from '../api/turn-decoders';
import type { TurnEvent } from '../api/turn-events';
import { useCancelTurn, useSubmitTurn } from '../api/turn-mutations';
import { useMeetingTurns } from '../api/turn-queries';
import { useTurnObservation } from '../api/use-turn-observation';
import type { MeetingsRuntime } from '../runtime/contract';
import { isApiError } from '@/shared/api/errors';

export interface MeetingTurnControllerOptions {
    meetingId: string;
    /** Composed runtime graph; omit for the historical live HTTP defaults. */
    runtime?: MeetingsRuntime;
    /** Test seam for deterministic request keys; production uses Web Crypto. */
    createRequestKey?: () => string;
    /** Called once per terminal transition, e.g. to refresh a legacy screen read. */
    onTerminal?: (event: TurnEvent | null, status: TurnStatus) => void;
}

export interface MeetingTurnController {
    operations: TurnOperation[];
    activeOperation: TurnOperation | null;
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
    const withCrypto = globalThis.crypto as Crypto | undefined;
    if (withCrypto && typeof withCrypto.randomUUID === 'function') {
        return withCrypto.randomUUID();
    }
    return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
        meetingId.length > 0 && (runtime?.capabilities.turnObservation ?? true),
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

    const observation = useTurnObservation({
        meetingId,
        operation: activeOperation,
        runtime,
        onTerminal,
    });

    const submit = useCallback(
        async (
            participantId: string,
            settings?: TurnGenerationSettings
        ): Promise<TurnOperation | null> => {
            if (runtime && !runtime.capabilities.submitTurn) return null;
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
            if (runtime && !runtime.capabilities.cancelTurn) return false;
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
