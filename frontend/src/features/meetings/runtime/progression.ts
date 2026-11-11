/**
 * The package owns the immutable turns and the required outcome ids. This module
 * owns the visitor's phase, availability, counts, and closing eligibility so the
 * room controls, runtime admission, and tutorial guidance cannot disagree.
 */
export interface ProgressionReplyTurn {
    kind: "reply";
    turn_id: string;
    participant_id?: string | null;
    required: boolean;
}

export interface ProgressionFollowUpTurn {
    kind: "follow_up";
    turn_id: string;
    required: boolean;
}

export type ProgressionTurn = ProgressionReplyTurn | ProgressionFollowUpTurn;

export type DeckPhase =
    | "opening"
    | "deliberation"
    | "follow-up"
    | "closing"
    | "closed";

export interface TurnAvailability {
    available: boolean;
    reason: string | null;
    revealTitle: boolean;
}

export interface DeckProgression {
    phase: DeckPhase;
    acceptedOutcomeIds: string[];
    requiredOutcomeIds: string[];
    acceptedCount: number;
    requiredCount: number;
    acceptedReplyCount: number;
    requiredReplyCount: number;
    progressLabel: string;
    turns: Record<string, TurnAvailability>;
    followUp: {
        available: boolean;
        reason: string | null;
        turnId: string | null;
    };
    closing: {
        eligible: boolean;
        reason: string | null;
    };
    instruction: string;
    closeReason: string | null;
}

export interface ProgressionInput {
    turns: readonly ProgressionTurn[];
    requiredTurnIds: readonly string[];
    acceptedTurnIds: ReadonlySet<string>;
    closingAccepted?: boolean;
    deckAttached?: boolean;
}

export function isReplyTurn(
    turn: ProgressionTurn
): turn is ProgressionReplyTurn {
    return turn.kind === "reply";
}

export function isFollowUpTurn(
    turn: ProgressionTurn
): turn is ProgressionFollowUpTurn {
    return turn.kind === "follow_up";
}

export function closingEligible(
    requiredTurnIds: readonly string[],
    acceptedTurnIds: ReadonlySet<string>
): boolean {
    return (
        requiredTurnIds.length > 0 &&
        requiredTurnIds.every((id) => acceptedTurnIds.has(id))
    );
}

/**
 * The opening turn is the first required reply for each participant. Later
 * replies stay locked until every participant who owns a required reply has
 * accepted one. The fixed follow-up then unlocks, and closing waits for every
 * required outcome id, including the follow-up.
 */
export function deriveProgression(input: ProgressionInput): DeckProgression {
    const deckAttached = input.deckAttached ?? true;
    const closingAccepted = input.closingAccepted ?? false;
    const requiredTurnIds = [...input.requiredTurnIds];
    const requiredReplyTurns = input.turns.filter(
        (turn): turn is ProgressionReplyTurn =>
            isReplyTurn(turn) && turn.required
    );
    const followUpTurns = input.turns.filter(
        (turn): turn is ProgressionFollowUpTurn =>
            isFollowUpTurn(turn) && turn.required
    );
    const requiredReplyIds = requiredReplyTurns.map((turn) => turn.turn_id);
    const acceptedOutcomeIds = requiredTurnIds.filter((id) =>
        input.acceptedTurnIds.has(id)
    );
    const acceptedReplyCount = requiredReplyIds.filter((id) =>
        input.acceptedTurnIds.has(id)
    ).length;
    const acceptedCount = acceptedOutcomeIds.length;
    const requiredCount = requiredTurnIds.length;
    const acceptedReplies = new Set(
        requiredReplyIds.filter((id) => input.acceptedTurnIds.has(id))
    );

    const openingTurnIds = new Set<string>();
    const seenParticipants = new Set<string>();
    for (const turn of requiredReplyTurns) {
        const participantId = turn.participant_id ?? "";
        if (seenParticipants.has(participantId)) continue;
        seenParticipants.add(participantId);
        openingTurnIds.add(turn.turn_id);
    }

    const requiredParticipantIds = new Set(
        requiredReplyTurns.map((turn) => turn.participant_id ?? "")
    );
    const everyParticipantHasReply = [...requiredParticipantIds].every(
        (participantId) =>
            requiredReplyTurns.some(
                (turn) =>
                    (turn.participant_id ?? "") === participantId &&
                    acceptedReplies.has(turn.turn_id)
            )
    );
    const allRepliesAccepted = requiredReplyIds.every((id) =>
        acceptedReplies.has(id)
    );
    const pendingFollowUp = followUpTurns.find(
        (turn) => !input.acceptedTurnIds.has(turn.turn_id)
    );
    const allRequiredAccepted = closingEligible(
        requiredTurnIds,
        input.acceptedTurnIds
    );

    let phase: DeckPhase;
    if (closingAccepted) {
        phase = "closed";
    } else if (allRequiredAccepted) {
        phase = "closing";
    } else if (allRepliesAccepted) {
        phase = pendingFollowUp ? "follow-up" : "closing";
    } else if (everyParticipantHasReply && requiredParticipantIds.size > 0) {
        phase = "deliberation";
    } else {
        phase = "opening";
    }

    const followUpAvailable =
        deckAttached && phase === "follow-up" && pendingFollowUp !== undefined;

    const turns: Record<string, TurnAvailability> = {};
    for (const turn of input.turns) {
        if (!turn.required) {
            turns[turn.turn_id] = {
                available: false,
                reason: "Optional prepared turn.",
                revealTitle: true,
            };
            continue;
        }
        if (!deckAttached) {
            turns[turn.turn_id] = {
                available: false,
                reason: "This saved checkpoint is read-only. Return to the prepared meeting to continue.",
                revealTitle: true,
            };
            continue;
        }
        if (closingAccepted) {
            turns[turn.turn_id] = {
                available: false,
                reason: "The meeting is closed.",
                revealTitle: true,
            };
            continue;
        }
        if (input.acceptedTurnIds.has(turn.turn_id)) {
            turns[turn.turn_id] = {
                available: false,
                reason: "Already recorded.",
                revealTitle: true,
            };
            continue;
        }
        if (isFollowUpTurn(turn)) {
            turns[turn.turn_id] = {
                available: followUpAvailable,
                reason: followUpAvailable
                    ? null
                    : "Finish the recorded replies before sending the follow-up.",
                revealTitle: true,
            };
            continue;
        }
        const opening = openingTurnIds.has(turn.turn_id);
        if (phase === "opening") {
            turns[turn.turn_id] = {
                available: opening,
                reason: opening
                    ? null
                    : "Available after every participant has spoken.",
                revealTitle: false,
            };
            continue;
        }
        if (phase === "deliberation") {
            turns[turn.turn_id] = {
                available: true,
                reason: null,
                revealTitle: !opening,
            };
            continue;
        }
        turns[turn.turn_id] = {
            available: false,
            reason:
                phase === "follow-up"
                    ? "The recorded replies are complete."
                    : "The meeting is closing.",
            revealTitle: true,
        };
    }

    const closingReason = !deckAttached
        ? "Return to the prepared meeting to continue."
        : closingAccepted
          ? "The meeting is closed."
          : requiredCount === 0
            ? "This package does not define a closing."
            : allRequiredAccepted
              ? null
              : phase === "opening"
                ? "Choose who speaks next to begin."
                : phase === "deliberation"
                  ? "Finish the discussion before closing."
                  : phase === "follow-up"
                    ? "Send the follow-up to close."
                    : "Finish the required steps before closing.";

    const instruction =
        phase === "opening" || phase === "deliberation"
            ? "Choose who speaks next."
            : phase === "follow-up"
              ? "Send your follow-up."
              : phase === "closing"
                ? "Close the meeting when you are ready."
                : "The meeting is closed.";

    return {
        phase,
        acceptedOutcomeIds,
        requiredOutcomeIds: requiredTurnIds,
        acceptedCount,
        requiredCount,
        acceptedReplyCount,
        requiredReplyCount: requiredReplyIds.length,
        progressLabel: `${acceptedCount} of ${requiredCount} outcomes`,
        turns,
        followUp: {
            available: followUpAvailable,
            reason: followUpAvailable
                ? null
                : "Finish the recorded replies before sending the follow-up.",
            turnId: pendingFollowUp?.turn_id ?? null,
        },
        closing: {
            eligible: deckAttached && phase === "closing",
            reason: closingReason,
        },
        instruction,
        closeReason: closingReason,
    };
}

export function turnIsAvailable(
    progression: DeckProgression,
    turnId: string
): boolean {
    return progression.turns[turnId]?.available ?? false;
}
