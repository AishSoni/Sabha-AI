'use client';

import { useState } from 'react';
import { Loader2, Play, RotateCcw, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMeetingsRuntime } from './context';

/**
 * Replay-only pacing control. Live meetings pace their own tokens, so this
 * renders nothing outside a recorded session that carries exploration data.
 */
export function ReplaySpeedControl() {
    const runtime = useMeetingsRuntime();
    const replay = runtime.replay;
    if (!replay || replay.transitions.length === 0) return null;

    return (
        <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label="Recorded playback speed"
        >
            <span className="text-xs text-zinc-500">Speed</span>
            {([1, 2] as const).map((speed) => (
                <Button
                    key={speed}
                    type="button"
                    size="sm"
                    variant={replay.playbackSpeed === speed ? 'secondary' : 'ghost'}
                    aria-pressed={replay.playbackSpeed === speed}
                    onClick={() => replay.setPlaybackSpeed(speed)}
                >
                    {speed}x
                </Button>
            ))}
        </div>
    );
}

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
    if (!replay || replay.transitions.length === 0) return null;

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

    return (
        <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-400">Prepared turn</span>
                {skipTarget ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void run('skip', skipTarget.intent_id)}
                    >
                        {busy === 'skip' ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                            <SkipForward className="mr-1 h-4 w-4" />
                        )}
                        Skip to prepared result
                    </Button>
                ) : null}
                {replayTarget ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => void run('replay', replayTarget.intent_id)}
                    >
                        {busy === 'replay' ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                            <RotateCcw className="mr-1 h-4 w-4" />
                        )}
                        Replay this prepared turn
                    </Button>
                ) : null}
                {!skipTarget && !replayTarget ? (
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                        <Play className="h-3.5 w-3.5" />
                        No prepared turn at this state.
                    </span>
                ) : null}
            </div>
            {replayTarget ? (
                <p className="mt-1 text-[11px] text-zinc-500">
                    Replay restarts this prepared turn without resetting the guided journey.
                </p>
            ) : null}
            {error ? (
                <p role="alert" className="mt-1 text-xs text-red-400">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
