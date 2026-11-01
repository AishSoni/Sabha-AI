import { describe, expect, it } from "vitest";
import type {
    ReplayBeat,
    ReplayBeatStep,
    ReplayTransition,
} from "../runtime/contract";
import { resolveGuidedBeatDestination } from "./replay-destination";

const beat: ReplayBeat = {
    beat_id: "address-uncertainty",
    title: "Address uncertainty",
    anchor: "demo-room",
    checkpoint: "checkpoint-downside",
    intent_id: null,
    ordinal: 5,
    objective: "Send the follow-up and ask the Portfolio Analyst.",
    route: "meeting",
    tab: "chat",
    start_checkpoint: "checkpoint-downside",
    completed_checkpoint: "checkpoint-portfolio",
    disclosure: "",
    steps: [],
    claim_ids: [],
    input_asset_ids: [],
};

function step(overrides: Partial<ReplayBeatStep>): ReplayBeatStep {
    return {
        step_id: "step",
        label: "Step",
        intent_id: null,
        requires_tab: null,
        completion: "turn_terminal",
        ...overrides,
    } as ReplayBeatStep;
}

function transition(
    overrides: Partial<ReplayTransition>
): ReplayTransition {
    return {
        transition_id: "transition",
        source_checkpoint: "checkpoint-downside",
        completed_checkpoint: "checkpoint-followup",
        intent_id: "director-follow-up",
        kind: "director_follow_up",
        participant_id: null,
        operation_id: "operation-follow-up",
        tape_id: null,
        closing_tape_id: null,
        canonical: true,
        prerequisites: [],
        label: "Send the supported follow-up",
        explanation: "",
        ...overrides,
    };
}

describe("resolveGuidedBeatDestination", () => {
    it("restores a later step from its own source after an earlier step settled", () => {
        const destination = resolveGuidedBeatDestination(
            beat,
            "meeting-1",
            [
                transition({}),
                transition({
                    transition_id: "portfolio",
                    source_checkpoint: "checkpoint-followup",
                    completed_checkpoint: "checkpoint-portfolio",
                    intent_id: "portfolio-analyst",
                    kind: "start_participant",
                    operation_id: "operation-portfolio",
                }),
            ],
            {
                pendingStep: step({
                    step_id: "ask-portfolio",
                    intent_id: "portfolio-analyst",
                }),
            }
        );

        expect(destination.checkpoint).toBe("checkpoint-followup");
        expect(destination.tab).toBe("chat");
        expect(destination.href).toBe(
            "/demo/meetings/meeting-1?tab=chat"
        );
    });

    it("returns a pending review to the completed evidence snapshot and its required tab", () => {
        const destination = resolveGuidedBeatDestination(
            beat,
            "meeting-1",
            [],
            {
                pendingStep: step({
                    completion: "acknowledge",
                    requires_tab: "consensus",
                }),
            }
        );

        expect(destination.checkpoint).toBe("checkpoint-portfolio");
        expect(destination.tab).toBe("consensus");
        expect(destination.href).toContain("tab=consensus");
    });

    it("restarts an interrupted action from its approved source", () => {
        const destination = resolveGuidedBeatDestination(
            beat,
            "meeting-1",
            [transition({ source_checkpoint: "checkpoint-downside" })],
            {
                interruptedIntentId: "director-follow-up",
                pendingStep: step({
                    intent_id: "director-follow-up",
                    completion: "checkpoint",
                }),
            }
        );

        expect(destination.checkpoint).toBe("checkpoint-downside");
    });

    it("exploration Back inspects the start of an already completed beat", () => {
        const destination = resolveGuidedBeatDestination(
            beat,
            "meeting-1",
            [],
            { preferStart: true }
        );

        expect(destination.checkpoint).toBe("checkpoint-downside");
        expect(destination.href).toBe(
            "/demo/meetings/meeting-1?tab=chat"
        );
    });
});
