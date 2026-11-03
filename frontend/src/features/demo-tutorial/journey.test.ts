import { describe, expect, it } from "vitest";
import type { ReplayBeat } from "@/features/meetings/runtime/contract";
import {
    deriveJourney,
    isRoomPath,
    type JourneyInput,
    type JourneySession,
} from "./journey";

function beat(overrides: Partial<ReplayBeat>): ReplayBeat {
    return {
        beat_id: "beat",
        title: "Beat",
        anchor: "anchor",
        checkpoint: "checkpoint-initial",
        intent_id: null,
        ordinal: 1,
        objective: null,
        route: "meeting",
        tab: "chat",
        start_checkpoint: null,
        completed_checkpoint: null,
        disclosure: null,
        steps: [],
        claim_ids: [],
        input_asset_ids: [],
        ...overrides,
    };
}

export function session(overrides: Partial<JourneySession> = {}): JourneySession {
    return {
        meeting_id: "meeting-1",
        initial_checkpoint: "checkpoint-initial",
        prepared_turns: [
            {
                turn_id: "turn-credit",
                kind: "reply",
                required: true,
            },
            {
                turn_id: "turn-downside",
                kind: "reply",
                required: true,
            },
            {
                turn_id: "turn-portfolio",
                kind: "reply",
                required: true,
            },
            {
                turn_id: "turn-committee",
                kind: "reply",
                required: true,
            },
            {
                turn_id: "turn-follow-up",
                kind: "follow_up",
                required: true,
            },
        ],
        prepared_closing: {
            required_turn_ids: [
                "turn-credit",
                "turn-downside",
                "turn-portfolio",
                "turn-committee",
                "turn-follow-up",
            ],
        },
        beats: [beat({})],
        ...overrides,
    };
}

export function journeyInput(overrides: Partial<JourneyInput> = {}): JourneyInput {
    return {
        pathname: "/demo",
        tab: null,
        session: session(),
        checkpoint: "checkpoint-initial",
        playedTurnIds: new Set<string>(),
        canClose: false,
        closingCompleted: false,
        settledIntents: new Set<string>(),
        meetingStatus: "active",
        roomVisited: false,
        ...overrides,
    };
}

describe("deriveJourney", () => {
    it("only marks the meeting created once the recorded checkpoint moves", () => {
        expect(deriveJourney(journeyInput()).meetingCreated).toBe(false);
        expect(
            deriveJourney(
                journeyInput({ checkpoint: "checkpoint-created" })
            ).meetingCreated
        ).toBe(true);
    });

    it("counts any played prepared reply without correcting the order", () => {
        const third = deriveJourney(
            journeyInput({ playedTurnIds: new Set(["turn-portfolio"]) })
        );
        expect(third.replyCount).toBe(1);
        expect(third.requiredReplyCount).toBe(4);
    });

    it("tracks the follow-up separately from the four replies", () => {
        const sent = deriveJourney(
            journeyInput({
                playedTurnIds: new Set([
                    "turn-credit",
                    "turn-follow-up",
                ]),
            })
        );
        expect(sent.followUpSent).toBe(true);
        expect(sent.replyCount).toBe(1);
    });

    it("stays in the recorded room once visited", () => {
        expect(
            deriveJourney(
                journeyInput({ pathname: "/demo/new", roomVisited: true })
            ).roomVisited
        ).toBe(true);
        expect(isRoomPath("/demo/meetings/meeting-1")).toBe(true);
        expect(isRoomPath("/demo/meetings")).toBe(false);
    });

    it("reads ended and archived status from the composed meeting", () => {
        expect(
            deriveJourney(journeyInput({ meetingStatus: "ended" })).ended
        ).toBe(true);
        expect(
            deriveJourney(journeyInput({ meetingStatus: "archived" })).archived
        ).toBe(true);
    });

    it("runs the legacy beat journey when no prepared deck exists", () => {
        const legacy = deriveJourney(
            journeyInput({
                session: session({
                    prepared_turns: [],
                    prepared_closing: null,
                }),
            })
        );
        expect(legacy.deck).toBe(false);
    });

    it("keeps the prepared deck selected when the closing is present", () => {
        expect(deriveJourney(journeyInput()).deck).toBe(true);
    });

    it("never advances from a route render alone", () => {
        const rendered = deriveJourney(
            journeyInput({ pathname: "/demo/meetings/meeting-1", tab: "chat" })
        );
        expect(rendered.replyCount).toBe(0);
        expect(rendered.closingCompleted).toBe(false);
    });
});
