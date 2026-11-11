/**
 * Journey tracker (spec-29).
 *
 * Progress is derived from recorded evidence the room itself accepted: an
 * installed checkpoint, a settled intent, a composed prepared turn, a closing
 * result or an archived meeting. Route renders, refetches, timers and mounting
 * never advance anything.
 */
import type { ReplayBeat } from "@/features/meetings/presentation";
import {
    deriveProgression,
    type DeckPhase,
} from "@/features/meetings/presentation";

export interface JourneyPreparedTurn {
    turn_id: string;
    kind: "reply" | "follow_up";
    required: boolean;
    participant_id?: string | null;
}

export interface JourneySession {
    meeting_id: string;
    initial_checkpoint: string;
    prepared_turns: readonly JourneyPreparedTurn[];
    prepared_closing: { required_turn_ids: readonly string[] } | null;
    beats: readonly ReplayBeat[];
}

export interface JourneyInput {
    pathname: string;
    tab: string | null;
    session: JourneySession;
    checkpoint: string;
    playedTurnIds: ReadonlySet<string>;
    canClose: boolean;
    closingCompleted: boolean;
    settledIntents: ReadonlySet<string>;
    meetingStatus: string | null;
    /** Sticky: the visitor has opened the recorded room at least once. */
    roomVisited: boolean;
    /** The prepared setup route is open. */
    setupOpen: boolean;
    /** The visitor submitted the recorded setup and saw the intake receipt. */
    intakeReady: boolean;
}

export interface TutorialJourney {
    meetingCreated: boolean;
    replyCount: number;
    requiredReplyCount: number;
    acceptedOutcomeCount: number;
    requiredOutcomeCount: number;
    progressLabel: string;
    phase: DeckPhase;
    followUpSent: boolean;
    canClose: boolean;
    closingCompleted: boolean;
    roomVisited: boolean;
    setupOpen: boolean;
    intakeReady: boolean;
    boardOpen: boolean;
    listOpen: boolean;
    roomOpen: boolean;
    archived: boolean;
    ended: boolean;
    /** The prepared turn deck exists; otherwise the legacy beat journey runs. */
    deck: boolean;
    tab: string | null;
    settledIntents: ReadonlySet<string>;
    beats: readonly ReplayBeat[];
}

export function isRoomPath(pathname: string): boolean {
    return /^\/demo\/meetings\/[^/]+$/.test(pathname);
}

export function deriveJourney(input: JourneyInput): TutorialJourney {
    const replies = input.session.prepared_turns.filter(
        (turn) => turn.kind === "reply"
    );
    const followUp =
        input.session.prepared_turns.find(
            (turn) => turn.kind === "follow_up"
        ) ?? null;
    const playedReplies = replies.filter((turn) =>
        input.playedTurnIds.has(turn.turn_id)
    );
    const deck =
        replies.length > 0 && input.session.prepared_closing !== null;
    const requiredTurnIds =
        input.session.prepared_closing?.required_turn_ids ?? [];
    const progression = deck
        ? deriveProgression({
              turns: input.session.prepared_turns,
              requiredTurnIds,
              acceptedTurnIds: input.playedTurnIds,
              closingAccepted: input.closingCompleted,
          })
        : null;
    return {
        // A schema-3 deck already exposes the prepared base checkpoint. Creation
        // is the visitor's recorded setup submission, not the base snapshot.
        meetingCreated: deck
            ? input.intakeReady
            : input.checkpoint !== input.session.initial_checkpoint,
        replyCount: playedReplies.length,
        requiredReplyCount: replies.filter((turn) => turn.required).length,
        acceptedOutcomeCount:
            progression?.acceptedCount ?? input.playedTurnIds.size,
        requiredOutcomeCount: progression?.requiredCount ?? requiredTurnIds.length,
        progressLabel:
            progression?.progressLabel ??
            `${input.playedTurnIds.size} of ${requiredTurnIds.length} outcomes`,
        phase: progression?.phase ?? "opening",
        followUpSent: followUp
            ? input.playedTurnIds.has(followUp.turn_id)
            : false,
        canClose: progression?.closing.eligible ?? input.canClose,
        closingCompleted: input.closingCompleted,
        roomVisited: input.roomVisited || isRoomPath(input.pathname),
        setupOpen: input.setupOpen || input.pathname === "/demo/new",
        intakeReady: input.intakeReady,
        boardOpen: input.pathname === "/demo",
        listOpen: input.pathname === "/demo/meetings",
        roomOpen: isRoomPath(input.pathname),
        archived: input.meetingStatus === "archived",
        ended: input.meetingStatus === "ended",
        deck,
        tab: input.tab,
        settledIntents: input.settledIntents,
        beats: input.session.beats,
    };
}
