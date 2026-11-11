/**
 * Browser-memory composition for the schema-3 prepared-turn deck (spec-28).
 *
 * The package is immutable. The visitor's chosen order lives only in this
 * module's state, and the displayed meeting is derived from the base snapshot
 * plus settled result snapshots. No canonical checkpoint is installed and no
 * server-side per-visitor state exists.
 */
import type { Consensus, Disagreement, MeetingWithParticipants, Message } from "../api/decoders";
import type { ContextStats } from "../api/decoders";
import type { TurnOperation } from "../api/turn-decoders";
import type {
    ReplayPreparedFollowUpTurn,
    ReplayPreparedReplyTurn,
    ReplayPreparedTurn,
} from "./contract";
import type { ReplayBundle, ReplaySession } from "./replay";

export const FOLLOW_UP_STEP = "__follow_up__";

export interface PreparedDeckState {
    base: ReplayBundle;
    order: string[];
    results: Record<string, ReplayBundle>;
    followUpSent: boolean;
    closing: ReplayBundle | null;
    archived: boolean;
    activeTurnId: string | null;
    lastCompletedTurnId: string | null;
}

export function emptyPreparedDeck(base: ReplayBundle): PreparedDeckState {
    return {
        base,
        order: [],
        results: {},
        followUpSent: false,
        closing: null,
        archived: false,
        activeTurnId: null,
        lastCompletedTurnId: null,
    };
}

export function replyTurns(session: ReplaySession): ReplayPreparedReplyTurn[] {
    return session.prepared_turns.filter(
        (turn): turn is ReplayPreparedReplyTurn => turn.kind === "reply"
    );
}

export function followUpTurn(
    session: ReplaySession
): ReplayPreparedFollowUpTurn | null {
    return (
        session.prepared_turns.find(
            (turn): turn is ReplayPreparedFollowUpTurn =>
                turn.kind === "follow_up"
        ) ?? null
    );
}

export function turnById(
    session: ReplaySession,
    turnId: string
): ReplayPreparedTurn | null {
    return session.prepared_turns.find((turn) => turn.turn_id === turnId) ?? null;
}

export function replyTurnForOperation(
    session: ReplaySession,
    operationId: string
): ReplayPreparedReplyTurn | null {
    return (
        replyTurns(session).find((turn) => turn.operation_id === operationId) ??
        null
    );
}

function followUpMessage(
    turn: ReplayPreparedFollowUpTurn,
    meeting: MeetingWithParticipants,
    sequence: number
): Message {
    return {
        id: turn.message_id,
        meeting_id: meeting.id,
        content: turn.question,
        sender_type: "user",
        sender_id: null,
        sender_name: "You",
        citations: [],
        tool_artifacts: null,
        thinking_content: null,
        estimated_cost: 0,
        effective_generation: null,
        sequence,
        request_key: "prepared-follow-up",
        operation_id: null,
        created_at: meeting.created_at,
    } as Message;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const item of items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        result.push(item);
    }
    return result;
}

function replyMessages(
    turn: ReplayPreparedReplyTurn,
    result: ReplayBundle
): Message[] {
    const wanted = new Set(turn.reply_message_ids);
    return (result.meeting.messages ?? []).filter((message) =>
        wanted.has(message.id)
    );
}

function summaryMessage(closing: ReplayBundle): Message | null {
    const summaryId = closing.closing?.summary_message_id;
    if (!summaryId) return null;
    return (
        (closing.meeting.messages ?? []).find(
            (message) => message.id === summaryId
        ) ?? null
    );
}

function activeOperation(
    session: ReplaySession,
    state: PreparedDeckState
): TurnOperation | null {
    if (!state.activeTurnId) return null;
    const turn = session.prepared_turns.find(
        (item) => item.turn_id === state.activeTurnId
    );
    if (!turn || turn.kind !== "reply") return null;
    return {
        operation_id: turn.operation_id,
        meeting_id: session.meeting_id,
        participant_id: turn.participant_id,
        request_key: turn.intent_id,
        status: "executing",
        admission: 0,
        queue_position: null,
        created_at: state.base.meeting.created_at,
        started_at: state.base.meeting.created_at,
        completed_at: null,
        final_message_id: null,
        cancel_requested: false,
        error: null,
        effective_generation: null,
    };
}

export function composedTurns(
    session: ReplaySession,
    state: PreparedDeckState
): TurnOperation[] {
    const completed = state.order
        .filter((turnId) => turnId !== FOLLOW_UP_STEP)
        .map((turnId) => {
            const turn = turnById(session, turnId);
            if (!turn || turn.kind !== "reply") return null;
            const result = state.results[turnId];
            const operation = result?.turns.find(
                (item) => item.operation_id === turn.operation_id
            );
            return operation ?? null;
        })
        .filter((operation): operation is TurnOperation => operation !== null);
    const active = activeOperation(session, state);
    return active ? [...completed, active] : completed;
}

export function composedBundle(
    session: ReplaySession,
    state: PreparedDeckState
): ReplayBundle {
    const base = state.base;
    // The opening request belongs to the prepared agenda, not to the visitor's
    // transcript. The deck therefore composes exactly four AI replies and the
    // single **You** follow-up.
    const messages: Message[] = [];
    for (const message of base.meeting.messages ?? []) {
        if (message.sender_type === "user") continue;
        messages.push(message);
    }
    const disagreements: Disagreement[] = [...base.disagreements];
    const consensus: Consensus[] = [...base.consensus];

    for (const step of state.order) {
        if (step === FOLLOW_UP_STEP) {
            const turn = followUpTurn(session);
            if (turn) {
                messages.push(
                    followUpMessage(
                        turn,
                        base.meeting,
                        messages.length
                    )
                );
            }
            continue;
        }
        const turn = turnById(session, step);
        const result = state.results[step];
        if (!turn || turn.kind !== "reply" || !result) continue;
        messages.push(...replyMessages(turn, result));
        disagreements.push(...result.disagreements);
        consensus.push(...result.consensus);
    }

    if (state.closing) {
        const summary = summaryMessage(state.closing);
        if (summary) messages.push(summary);
    }

    const sequenced = messages.map((message, index) => ({
        ...message,
        sequence: index,
    }));
    const status = state.archived
        ? "archived"
        : state.closing
          ? "ended"
          : base.meeting.status;

    const meeting: MeetingWithParticipants = {
        ...base.meeting,
        status,
        messages: sequenced,
    };
    const operations = composedTurns(session, state);
    const contextStats: ContextStats | null = base.contextStats
        ? {
              ...base.contextStats,
              message_count: sequenced.length,
              message_tokens: Math.max(
                  0,
                  base.contextStats.message_tokens ?? 0
              ),
          }
        : null;

    return {
        meeting,
        disagreements: uniqueById(disagreements),
        consensus: uniqueById(consensus),
        contextStats,
        closing: state.closing?.closing ?? base.closing,
        turns: operations,
    };
}

export function acceptedTurnIds(
    session: ReplaySession,
    state: PreparedDeckState
): Set<string> {
    const played = new Set(Object.keys(state.results));
    const followUp = followUpTurn(session);
    if (state.followUpSent && followUp) played.add(followUp.turn_id);
    return played;
}

export function remapOperation(
    session: ReplaySession,
    operationId: string
): ReplayPreparedReplyTurn | null {
    return replyTurnForOperation(session, operationId);
}
