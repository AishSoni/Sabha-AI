"use client";

/**
 * Recorded participant intent (spec-17, expanded by spec-26).
 *
 * The buttons select declared recorded operations and checkpoints; they never
 * post a command or reach the live vault/provider/cooldown graph. Inside the
 * guided journey only the current prepared turn is offered, so the room and the
 * guide cannot advance on different paths. Exploration branches remain
 * available because their transitions are non-canonical.
 */
import { useState, type ComponentProps } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnchorRef } from "@/features/demo-tutorial/anchors";
import {
    anchorForIntent,
    type TutorialAnchorId,
} from "@/features/demo-tutorial/contract";
import {
    isActionAllowedByGuide,
    useGuideActions,
} from "../guide/guide-actions";
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
    const guide = useGuideActions();
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
                            disabled={
                                busy ||
                                isActive ||
                                isQueued ||
                                Boolean(replay.activePreparedOperationId)
                            }
                            className="border-indigo-700 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/40"
                            onClick={async () => {
                                setBusyIntent(turn.turn_id);
                                try {
                                    await replay.startPreparedTurn(turn.turn_id);
                                } finally {
                                    setBusyIntent(null);
                                }
                            }}
                        >
                            <Play className="w-4 h-4 mr-1" />
                            {busy ? "Preparing…" : turn.label}
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
        return isActionAllowedByGuide(action, guide);
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
                    </TurnButton>
                );
            })}
        </div>
    );
}
