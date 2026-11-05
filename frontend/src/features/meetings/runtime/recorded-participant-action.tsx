"use client";

/**
 * Recorded participant intent (spec-17, expanded by spec-26).
 *
 * The buttons select declared recorded operations and checkpoints; they never
 * post a command or reach the live vault/provider/cooldown graph. The prepared
 * turn deck offers every outstanding reply for the participant; the tutorial
 * observes the room's outcome instead of gating the choice. Exploration
 * branches remain available because their transitions are non-canonical.
 */
import { useState, type ComponentProps } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    anchorForIntent,
    useAnchorRef,
    type TutorialAnchorId,
} from "@/features/demo-tutorial";
import { useMeetingsRuntime } from "./context";
import type { ParticipantActionProps } from "./contract";

function TurnButton({
    anchor,
    ...props
}: { anchor: TutorialAnchorId | null } & ComponentProps<typeof Button>) {
    const ref = useAnchorRef(anchor);
    return <Button ref={ref} {...props} />;
}

export function RecordedParticipantAction({
    participant,
    isActive,
    isQueued,
}: ParticipantActionProps) {
    const runtime = useMeetingsRuntime();
    const replay = runtime.replay;
    const [busyIntent, setBusyIntent] = useState<string | null>(null);

    if (!replay) return null;

    const deckActive =
        replay.preparedBaseCheckpoint !== null &&
        replay.checkpoint === replay.preparedBaseCheckpoint;
    const playedTurnIds = replay.playedTurnIds ?? new Set<string>();
    const preparedTurns = deckActive
        ? (replay.preparedTurns ?? []).filter(
              (turn) =>
                  turn.kind === "reply" &&
                  turn.participant_id === participant.id &&
                  !playedTurnIds.has(turn.turn_id)
          )
        : [];
    if (preparedTurns.length > 0) {
        return (
            <div className="flex flex-wrap gap-2">
                {preparedTurns.map((turn) => {
                    const busy = busyIntent === turn.turn_id;
                    return (
                        <TurnButton
                            key={turn.turn_id}
                            anchor={anchorForIntent(turn.intent_id)}
                            variant="outline"
                            size="sm"
                            busy={busy}
                            busyLabel="Preparing turn"
                            disabled={
                                isActive ||
                                isQueued ||
                                Boolean(replay.activePreparedOperationId)
                            }
                            onClick={async () => {
                                setBusyIntent(turn.turn_id);
                                try {
                                    await replay.startPreparedTurn(turn.turn_id);
                                } finally {
                                    setBusyIntent(null);
                                }
                            }}
                        >
                            <Play className="mr-1 size-4" />
                            {turn.label}
                        </TurnButton>
                    );
                })}
            </div>
        );
    }

    const actions = replay.legalActions(participant.id).filter((action) => {
        if (
            action.intent.kind !== "start_participant" ||
            !action.available ||
            replay.settledIntents.has(action.intent.intent_id)
        ) {
            return false;
        }
        return true;
    });

    if (actions.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
                const busy = busyIntent === action.intent.intent_id;
                return (
                    <TurnButton
                        key={action.transition.transition_id}
                        anchor={anchorForIntent(action.intent.intent_id)}
                        variant="outline"
                        size="sm"
                        busy={busy}
                        busyLabel="Preparing turn"
                        disabled={isActive || isQueued}
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
                        <Play className="mr-1 size-4" />
                        {action.transition.label ||
                            action.intent.label ||
                            participant.name}
                    </TurnButton>
                );
            })}
        </div>
    );
}
