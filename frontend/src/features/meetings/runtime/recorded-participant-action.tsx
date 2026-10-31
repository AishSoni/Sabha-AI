"use client";

/**
 * Recorded participant intent (spec-17, expanded by spec-26).
 *
 * The buttons select declared recorded operations and checkpoints; they never
 * post a command or reach the live vault/provider/cooldown graph. Every legal
 * prepared turn is offered, so a participant with more than one recorded turn
 * is resolved by intent identity rather than the first matching intent.
 */
import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMeetingsRuntime } from "./context";
import { useActiveReplayIntentId } from "./active-intent";
import type { ParticipantActionProps } from "./contract";

export function RecordedParticipantAction({
    participant,
    isActive,
    isQueued,
}: ParticipantActionProps) {
    const runtime = useMeetingsRuntime();
    const replay = runtime.replay;
    const activeIntentId = useActiveReplayIntentId();
    const [busyIntent, setBusyIntent] = useState<string | null>(null);

    if (!replay) return null;

    const legacy = replay.transitions.length === 0;
    const actions = replay
        .legalActions(participant.id)
        .filter(
            (action) =>
                action.intent.kind === "start_participant" &&
                action.available &&
                (!legacy ||
                    activeIntentId === null ||
                    action.intent.intent_id === activeIntentId)
        );

    if (actions.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
                const busy = busyIntent === action.intent.intent_id;
                return (
                    <Button
                        key={action.transition.transition_id}
                        variant="outline"
                        size="sm"
                        disabled={busy || isActive || isQueued}
                        className="border-indigo-700 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/40"
                        title={action.transition.explanation || undefined}
                        onClick={async () => {
                            setBusyIntent(action.intent.intent_id);
                            try {
                                await replay.startIntent(
                                    action.intent.intent_id
                                );
                            } finally {
                                setBusyIntent(null);
                            }
                        }}
                    >
                        <Play className="w-4 h-4 mr-1" />
                        {busy
                            ? "Preparing…"
                            : action.transition.label ||
                              action.intent.label ||
                              participant.name}
                    </Button>
                );
            })}
        </div>
    );
}
