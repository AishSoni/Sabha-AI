'use client';

import { useState } from 'react';
import { RotateCcw, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMeetingsRuntime } from './context';

/**
 * Controls for the prepared turn that owns the current state. They only
 * install validated checkpoints; the recording decides what the result is.
 */
export function PreparedTurnControls({
    activeOperationId,
}: {
    activeOperationId?: string | null;
}) {
    const runtime = useMeetingsRuntime();
    const replay = runtime.replay;
    const [busy, setBusy] = useState<'skip' | 'replay' | null>(null);
    const [error, setError] = useState<string | null>(null);
    if (!replay) return null;

    if ((replay.preparedTurns ?? []).length > 0) {
        const activePrepared = Boolean(replay.activePreparedOperationId);
        const lastTurnId = replay.lastCompletedTurnId;
        if (!activePrepared && !lastTurnId) return null;
        const runDeck = async (kind: 'skip' | 'replay') => {
            setBusy(kind);
            setError(null);
            try {
                if (kind === 'skip') await replay.showFullPreparedResponse();
                else if (lastTurnId) await replay.replayPreparedTurn(lastTurnId);
            } catch (cause) {
                setError(
                    cause instanceof Error
                        ? cause.message
                        : 'The prepared turn could not be opened.'
                );
            } finally {
                setBusy(null);
            }
        };
        return (
            <div className="flex flex-wrap items-center gap-2">
                {activePrepared ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        busy={busy === 'skip'}
                        busyLabel="Opening response"
                        disabled={busy !== null}
                        onClick={() => void runDeck('skip')}
                    >
                        <SkipForward className="mr-1 size-4" />
                        Show full response
                    </Button>
                ) : null}
                {!activePrepared && lastTurnId ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        busy={busy === 'replay'}
                        busyLabel="Replaying turn"
                        disabled={busy !== null}
                        onClick={() => void runDeck('replay')}
                    >
                        <RotateCcw className="mr-1 size-4" />
                        Replay last turn
                    </Button>
                ) : null}
                {error ? (
                    <p role="alert" className="type-meta text-danger">
                        {error}
                    </p>
                ) : null}
            </div>
        );
    }

    if (replay.transitions.length === 0) return null;

    const active = activeOperationId
        ? replay.transitions.find(
              (transition) => transition.operation_id === activeOperationId
          )
        : undefined;
    const incoming = replay.transitions.find(
        (transition) =>
            transition.tape_id && transition.completed_checkpoint === replay.checkpoint
    );
    const skipTarget = active;
    const replayTarget = active ?? incoming;

    const run = async (kind: 'skip' | 'replay', intentId: string) => {
        setBusy(kind);
        setError(null);
        try {
            if (kind === 'skip') await replay.skipIntent(intentId);
            else await replay.replayIntent(intentId);
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : 'The prepared turn could not be opened.'
            );
        } finally {
            setBusy(null);
        }
    };

    if (!skipTarget && !replayTarget) return null;

    return (
        <div className="rounded-control border border-separator bg-surface-raised px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
                {skipTarget ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        busy={busy === 'skip'}
                        busyLabel="Opening response"
                        disabled={busy !== null}
                        onClick={() => void run('skip', skipTarget.intent_id)}
                    >
                        <SkipForward className="mr-1 size-4" />
                        Show full response
                    </Button>
                ) : null}
                {replayTarget ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        busy={busy === 'replay'}
                        busyLabel="Replaying turn"
                        disabled={busy !== null}
                        onClick={() => void run('replay', replayTarget.intent_id)}
                    >
                        <RotateCcw className="mr-1 size-4" />
                        Replay this prepared turn
                    </Button>
                ) : null}
            </div>
            {error ? (
                <p role="alert" className="mt-1 type-meta text-danger">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
