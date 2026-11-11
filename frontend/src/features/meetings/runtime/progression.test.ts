import { describe, expect, it } from "vitest";

import type { ReplayPreparedTurn } from "./contract";
import {
    closingEligible,
    deriveProgression,
    type ProgressionInput,
} from "./progression";

const REQUIRED = ["reply-credit", "reply-downside", "reply-portfolio", "reply-consensus", "follow-up"];

function reply(
    turnId: string,
    participantId: string,
    label: string
): ReplayPreparedTurn {
    return {
        kind: "reply",
        turn_id: turnId,
        participant_id: participantId,
        label,
        intent_id: turnId,
        operation_id: `operation-${turnId}`,
        tape_id: `tape-${turnId}`,
        result_checkpoint: `checkpoint-${turnId}`,
        reply_message_ids: [`message-${turnId}`],
        effect_ids: [],
        required: true,
    };
}

function input(
    accepted: string[],
    overrides: Partial<ProgressionInput> = {}
): ProgressionInput {
    return {
        turns: [
            reply("reply-credit", "mira", "Credit Analyst opening facts"),
            reply("reply-downside", "arjun", "Downside challenge"),
            reply("reply-portfolio", "leena", "Mandate review"),
            reply("reply-consensus", "mira", "Committee alignment"),
            {
                kind: "follow_up",
                turn_id: "follow-up",
                label: "You",
                question: "What can you conclude?",
                message_id: "follow-message",
                intent_id: "director-follow-up",
                participant_id: null,
                required: true,
            },
        ],
        requiredTurnIds: REQUIRED,
        acceptedTurnIds: new Set(accepted),
        ...overrides,
    };
}

describe("prepared deck progression", () => {
    it("starts with one opening reply per participant and no authored titles", () => {
        const progression = deriveProgression(input([]));

        expect(progression.phase).toBe("opening");
        expect(progression.turns["reply-credit"]).toMatchObject({
            available: true,
            revealTitle: false,
        });
        expect(progression.turns["reply-downside"]).toMatchObject({
            available: true,
            revealTitle: false,
        });
        expect(progression.turns["reply-portfolio"]).toMatchObject({
            available: true,
            revealTitle: false,
        });
        expect(progression.turns["reply-consensus"]).toMatchObject({
            available: false,
            revealTitle: false,
        });
        expect(progression.followUp.available).toBe(false);
        expect(progression.closing.eligible).toBe(false);
        expect(progression.progressLabel).toBe("0 of 5 outcomes");
    });

    it("accepts an arbitrary opening order and keeps later turns locked", () => {
        const progression = deriveProgression(input(["reply-downside"]));

        expect(progression.phase).toBe("opening");
        expect(progression.turns["reply-downside"].available).toBe(false);
        expect(progression.turns["reply-credit"].available).toBe(true);
        expect(progression.turns["reply-portfolio"].available).toBe(true);
        expect(progression.turns["reply-consensus"].available).toBe(false);
        expect(progression.acceptedCount).toBe(1);
    });

    it("unlocks the remaining reply only after every participant has spoken", () => {
        const progression = deriveProgression(
            input(["reply-portfolio", "reply-credit", "reply-downside"])
        );

        expect(progression.phase).toBe("deliberation");
        expect(progression.turns["reply-consensus"]).toMatchObject({
            available: true,
            revealTitle: true,
        });
        expect(progression.closing.eligible).toBe(false);
        expect(progression.closeReason).toBe("Finish the discussion before closing.");
    });

    it("unlocks the fixed follow-up after all required replies are accepted", () => {
        const progression = deriveProgression(
            input([
                "reply-credit",
                "reply-downside",
                "reply-portfolio",
                "reply-consensus",
            ])
        );

        expect(progression.phase).toBe("follow-up");
        expect(progression.followUp).toMatchObject({
            available: true,
            turnId: "follow-up",
        });
        expect(progression.turns["reply-consensus"].available).toBe(false);
        expect(progression.acceptedReplyCount).toBe(4);
        expect(progression.progressLabel).toBe("4 of 5 outcomes");
        expect(progression.closeReason).toBe("Send the follow-up to close.");
    });

    it("enables closing only when every required outcome is accepted", () => {
        const progression = deriveProgression(
            input([
                "reply-credit",
                "reply-downside",
                "reply-portfolio",
                "reply-consensus",
                "follow-up",
            ])
        );

        expect(progression.phase).toBe("closing");
        expect(progression.closing).toEqual({ eligible: true, reason: null });
        expect(progression.acceptedCount).toBe(5);
        expect(progression.progressLabel).toBe("5 of 5 outcomes");
    });

    it("treats an accepted closing as the closed finale", () => {
        const progression = deriveProgression(
            input(
                [
                    "reply-credit",
                    "reply-downside",
                    "reply-portfolio",
                    "reply-consensus",
                    "follow-up",
                ],
                { closingAccepted: true }
            )
        );

        expect(progression.phase).toBe("closed");
        expect(progression.closing.eligible).toBe(false);
        expect(progression.closeReason).toBe("The meeting is closed.");
        expect(progression.instruction).toBe("The meeting is closed.");
    });

    it("ignores accepted ids outside the required outcome set", () => {
        const progression = deriveProgression(
            input(["reply-credit", "not-a-turn"])
        );

        expect(progression.acceptedOutcomeIds).toEqual(["reply-credit"]);
        expect(progression.acceptedCount).toBe(1);
        expect(progression.progressLabel).toBe("1 of 5 outcomes");
    });

    it("keeps every action unavailable on a read-only checkpoint", () => {
        const progression = deriveProgression(
            input([], { deckAttached: false })
        );

        expect(progression.turns["reply-credit"].available).toBe(false);
        expect(progression.followUp.available).toBe(false);
        expect(progression.closing.eligible).toBe(false);
        expect(progression.closeReason).toBe(
            "Return to the prepared meeting to continue."
        );
    });

    it("never closes when the required set is missing or empty", () => {
        expect(closingEligible([], new Set())).toBe(false);
        expect(
            closingEligible(["known", "missing"], new Set(["known"]))
        ).toBe(false);
        const progression = deriveProgression(
            input([], { requiredTurnIds: ["missing"] })
        );
        expect(progression.closing.eligible).toBe(false);
    });
});
