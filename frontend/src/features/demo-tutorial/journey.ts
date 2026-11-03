/**
 * Journey tracker (spec-29).
 *
 * Progress is derived from recorded evidence the room itself accepted: an
 * installed checkpoint, a settled intent, a composed prepared turn, a closing
 * result or an archived meeting. Route renders, refetches, timers and mounting
 * never advance anything.
 */
import type { ReplayBeat } from "@/features/meetings/runtime/contract";

export interface JourneyPreparedTurn {
    turn_id: string;
    kind: "reply" | "follow_up";
    required: boolean;
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
    /** Sticky: room tabs the visitor has actually opened. */
    visitedTabs: ReadonlySet<string>;
}

export interface TutorialJourney {
    meetingCreated: boolean;
    replyCount: number;
    requiredReplyCount: number;
    followUpSent: boolean;
    canClose: boolean;
    closingCompleted: boolean;
    roomVisited: boolean;
    listOpen: boolean;
    archived: boolean;
    ended: boolean;
    /** The prepared turn deck exists; otherwise the legacy beat journey runs. */
    deck: boolean;
    tab: string | null;
    settledIntents: ReadonlySet<string>;
    visitedTabs: ReadonlySet<string>;
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
    return {
        meetingCreated: input.checkpoint !== input.session.initial_checkpoint,
        replyCount: playedReplies.length,
        requiredReplyCount: replies.filter((turn) => turn.required).length,
        followUpSent: followUp
            ? input.playedTurnIds.has(followUp.turn_id)
            : false,
        canClose: input.canClose,
        closingCompleted: input.closingCompleted,
        roomVisited: input.roomVisited || isRoomPath(input.pathname),
        listOpen: input.pathname === "/demo/meetings",
        archived: input.meetingStatus === "archived",
        ended: input.meetingStatus === "ended",
        deck: replies.length > 0 && input.session.prepared_closing !== null,
        tab: input.tab,
        settledIntents: input.settledIntents,
        visitedTabs: input.visitedTabs,
        beats: input.session.beats,
    };
}
