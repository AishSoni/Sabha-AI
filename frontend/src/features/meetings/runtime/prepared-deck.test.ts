import { describe, expect, it } from "vitest";

import type { MeetingWithParticipants, Message } from "../api/decoders";
import type { TurnOperation } from "../api/turn-decoders";
import type { ReplayPreparedClosing, ReplayPreparedTurn } from "./contract";
import {
    FOLLOW_UP_STEP,
    canCloseDeck,
    composedBundle,
    emptyPreparedDeck,
    replyTurnForOperation,
    type PreparedDeckState,
} from "./prepared-deck";
import type { ReplayBundle, ReplaySession } from "./replay";

const MEETING = "meeting-1";

function message(
    id: string,
    sequence: number,
    senderType: "user" | "ai",
    senderName: string,
    content = id
): Message {
    return {
        id,
        meeting_id: MEETING,
        content,
        sender_type: senderType,
        sender_id: senderType === "ai" ? `${senderName}-id` : null,
        sender_name: senderName,
        citations: [],
        tool_artifacts: null,
        thinking_content: null,
        estimated_cost: 0,
        effective_generation: null,
        sequence,
        request_key: id,
        operation_id: senderType === "ai" ? `op-${id}` : null,
        created_at: "2020-07-31T09:00:00Z",
    } as Message;
}

function meeting(messages: Message[], status = "active"): MeetingWithParticipants {
    return {
        id: MEETING,
        name: "Recorded review",
        agenda: "Prepared review",
        user_id: null,
        status,
        total_cost: 0,
        created_at: "2020-07-31T09:00:00Z",
        participants: [],
        messages,
    } as MeetingWithParticipants;
}

function operation(id: string, participantId: string): TurnOperation {
    return {
        operation_id: `op-${id}`,
        meeting_id: MEETING,
        participant_id: participantId,
        request_key: id,
        status: "completed",
        admission: 1,
        queue_position: null,
        created_at: "2020-07-31T09:00:00Z",
        started_at: "2020-07-31T09:00:00Z",
        completed_at: "2020-07-31T09:05:00Z",
        final_message_id: id,
        cancel_requested: false,
        error: null,
        effective_generation: null,
    } as TurnOperation;
}

function result(id: string, participantId: string): ReplayBundle {
    return {
        meeting: meeting([
            message("opening", 0, "user", "Director"),
            message(id, 1, "ai", "Participant"),
        ]),
        disagreements: [],
        consensus: [],
        contextStats: null,
        closing: null,
        turns: [operation(id, participantId)],
    };
}

const CLOSING: ReplayPreparedClosing = {
    closing_tape_id: "tape-closing",
    completed_checkpoint: "checkpoint-closed",
    archived_checkpoint: "checkpoint-archived",
    required_turn_ids: ["turn-a", "turn-b", "turn-follow"],
};

function turn(id: string, participantId: string): ReplayPreparedTurn {
    return {
        kind: "reply",
        turn_id: id,
        participant_id: participantId,
        label: `Reply ${id}`,
        intent_id: id,
        operation_id: `op-${id}`,
        tape_id: `tape-${id}`,
        result_checkpoint: `checkpoint-${id}`,
        reply_message_ids: [id],
        effect_ids: [`op-${id}`],
        required: true,
    };
}

function session(): ReplaySession {
    return {
        run_id: "run-1",
        package_version: "8",
        meeting_id: MEETING,
        label: "Prepared demo",
        title: "Recorded review",
        as_of: "2020-07-31",
        disclosure: "",
        stack_labels: {},
        provenance: {},
        capabilities: {} as ReplaySession["capabilities"],
        package_id: "package-1",
        content_sha256: "a".repeat(64),
        checkpoint_id: "checkpoint-prepared-base",
        initial_checkpoint: "checkpoint-initial",
        checkpoints: ["checkpoint-prepared-base"],
        intents: [],
        beats: [],
        chapters: [],
        transitions: [],
        tapes: [],
        assets: [],
        claims: [],
        prepared_base_checkpoint: "checkpoint-prepared-base",
        prepared_turns: [
            turn("turn-a", "credit"),
            turn("turn-b", "downside"),
            {
                kind: "follow_up",
                turn_id: "turn-follow",
                label: "You",
                question: "What can you conclude?",
                message_id: "follow-message",
                intent_id: "follow-intent",
                participant_id: null,
                required: true,
            },
        ],
        prepared_closing: CLOSING,
        preview: { available: false, asset_ids: [] },
        retired: false,
    };
}

function state(order: string[]): PreparedDeckState {
    const base = {
        meeting: meeting([message("opening", 0, "user", "Director")]),
        disagreements: [],
        consensus: [],
        contextStats: null,
        closing: null,
        turns: [],
    } satisfies ReplayBundle;
    return {
        ...emptyPreparedDeck(base),
        order,
        results: {
            "turn-a": result("turn-a", "credit"),
            "turn-b": result("turn-b", "downside"),
        },
        followUpSent: order.includes(FOLLOW_UP_STEP),
    };
}

describe("prepared deck composition", () => {
    it("follows the visitor order and keeps the single You follow-up", () => {
        const followFirst = composedBundle(
            session(),
            state([FOLLOW_UP_STEP, "turn-b", "turn-a"])
        );
        expect(followFirst.meeting.messages?.map((item) => item.id)).toEqual([
            "opening",
            "follow-message",
            "turn-b",
            "turn-a",
        ]);
        expect(
            followFirst.meeting.messages?.filter(
                (item) => item.sender_type === "user"
            )
        ).toHaveLength(2);
        expect(
            followFirst.meeting.messages?.filter(
                (item) => item.sender_type === "ai"
            )
        ).toHaveLength(2);
        expect(followFirst.meeting.messages?.[1].sender_name).toBe("You");
        expect(followFirst.turns.map((item) => item.operation_id)).toEqual([
            "op-turn-b",
            "op-turn-a",
        ]);
    });

    it("keeps a different order without duplicating messages", () => {
        const reverse = composedBundle(
            session(),
            state(["turn-a", "turn-b", FOLLOW_UP_STEP])
        );
        expect(reverse.meeting.messages?.map((item) => item.id)).toEqual([
            "opening",
            "turn-a",
            "turn-b",
            "follow-message",
        ]);
        expect(new Set(reverse.meeting.messages?.map((item) => item.id)).size).toBe(
            4
        );
    });

    it("resolves repeated participants by turn identity", () => {
        const current = session();
        expect(replyTurnForOperation(current, "op-turn-a")?.turn_id).toBe(
            "turn-a"
        );
        expect(replyTurnForOperation(current, "op-turn-b")?.turn_id).toBe(
            "turn-b"
        );
        expect(replyTurnForOperation(current, "missing")).toBeNull();
    });

    it("requires every prepared turn before closing", () => {
        const current = session();
        expect(canCloseDeck(current, new Set(["turn-a", "turn-b"]))).toBe(false);
        expect(
            canCloseDeck(
                current,
                new Set(["turn-a", "turn-b", "turn-follow"])
            )
        ).toBe(true);
    });
});
