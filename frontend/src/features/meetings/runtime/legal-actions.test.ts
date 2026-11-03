import { describe, expect, it } from "vitest";

import type { ReplayIntent, ReplayTransition } from "./contract";
import { replayLegalActions, type ReplaySession } from "./replay";

const checkpoint = {
    "checkpoint-created": "checkpoint-created",
    "checkpoint-downside": "checkpoint-downside",
    "checkpoint-followup": "checkpoint-followup",
    "checkpoint-consensus": "checkpoint-consensus",
};

function intent(
    intentId: string,
    participantId: string,
    at: string
): ReplayIntent {
    return {
        intent_id: intentId,
        kind: "start_participant",
        checkpoint: at,
        participant_id: participantId,
        operation_id: `op-${intentId}`,
        tape_id: `tape-${intentId}`,
        closing_tape_id: null,
        label: `Ask ${participantId}`,
    };
}

function transition(
    transitionId: string,
    intentId: string,
    source: string,
    completed: string,
    prerequisites: string[] = [],
    participantId = intentId.split("-")[0]
): ReplayTransition {
    return {
        transition_id: transitionId,
        source_checkpoint: source,
        completed_checkpoint: completed,
        intent_id: intentId,
        kind: "start_participant",
        participant_id: participantId,
        operation_id: `op-${intentId}`,
        tape_id: `tape-${intentId}`,
        closing_tape_id: null,
        canonical: false,
        prerequisites,
        label: `Prepared ${intentId}`,
        explanation: "",
    };
}

function session(
    intents: ReplayIntent[],
    transitions: ReplayTransition[]
): ReplaySession {
    return {
        run_id: "run-1",
        package_version: "6",
        meeting_id: "meeting-1",
        label: "Recorded",
        title: "Recorded review",
        as_of: "2020-07-31",
        disclosure: "",
        stack_labels: {},
        provenance: {},
        capabilities: {} as ReplaySession["capabilities"],
        package_id: "package-1",
        content_sha256: "a".repeat(64),
        checkpoint_id: "checkpoint-created",
        initial_checkpoint: "checkpoint-created",
        checkpoints: Object.values(checkpoint),
        intents,
        beats: [],
        chapters: [
            {
                chapter_id: "chapter-created",
                title: "Opening review",
                objective: "Begin the review",
                checkpoint: "checkpoint-created",
                route: "meeting",
                tab: "chat",
                mode: "playback",
                disclosure: "",
                summary_message_id: null,
                claim_ids: [],
                input_asset_ids: [],
            },
        ],
        transitions,
        tapes: [],
        assets: [],
        claims: [],
        prepared_base_checkpoint: null,
        prepared_turns: [],
        prepared_closing: null,
        preview: { available: false, asset_ids: [] },
        retired: false,
    } as ReplaySession;
}

describe("replayLegalActions", () => {
    it("offers every prepared participant turn at the current state", () => {
        const credit = intent("credit-analyst", "credit", "checkpoint-created");
        const downside = intent("downside-first", "downside", "checkpoint-created");
        const actions = replayLegalActions(
            session(
                [credit, downside],
                [
                    transition(
                        "explore-credit",
                        credit.intent_id,
                        "checkpoint-created",
                        "checkpoint-credit"
                    ),
                    transition(
                        "explore-downside",
                        downside.intent_id,
                        "checkpoint-created",
                        "checkpoint-downside"
                    ),
                ]
            ),
            "checkpoint-created",
            new Set()
        );

        expect(actions.map((action) => action.intent.intent_id)).toEqual([
            "credit-analyst",
            "downside-first",
        ]);
        expect(actions.every((action) => action.available)).toBe(true);
        expect(actions.every((action) => action.reason === null)).toBe(true);
    });

    it("resolves repeated participant turns by intent identity", () => {
        const early = intent("credit-early", "credit", "checkpoint-created");
        const late = intent("credit-late", "credit", "checkpoint-downside");
        const actions = replayLegalActions(
            session(
                [early, late],
                [
                    transition(
                        "explore-early",
                        early.intent_id,
                        "checkpoint-created",
                        "checkpoint-credit",
                        [],
                        "credit"
                    ),
                    transition(
                        "explore-late",
                        late.intent_id,
                        "checkpoint-downside",
                        "checkpoint-consensus",
                        [],
                        "credit"
                    ),
                ]
            ),
            "checkpoint-downside",
            new Set(),
            "credit"
        );

        const available = actions.filter((action) => action.available);

        expect(available).toHaveLength(1);
        expect(available[0].intent.intent_id).toBe("credit-late");
        expect(available[0].transition.transition_id).toBe("explore-late");
        expect(
            actions.find(
                (action) => action.transition.transition_id === "explore-early"
            )?.reason
        ).toBe("Available from “Opening review”.");
    });

    it("withholds a prepared turn until its prerequisite has settled", () => {
        const first = intent("followup", "director", "checkpoint-created");
        const second = intent("portfolio", "portfolio", "checkpoint-followup");
        const transitions = [
            transition(
                "explore-followup",
                first.intent_id,
                "checkpoint-created",
                "checkpoint-followup"
            ),
            transition(
                "explore-portfolio",
                second.intent_id,
                "checkpoint-followup",
                "checkpoint-consensus",
                ["explore-followup"]
            ),
        ];
        const blocked = replayLegalActions(
            session([first, second], transitions),
            "checkpoint-followup",
            new Set()
        ).find((action) => action.transition.transition_id === "explore-portfolio");

        expect(blocked?.available).toBe(false);
        expect(blocked?.reason).toBe(
            "Complete the preceding prepared action first."
        );

        const allowed = replayLegalActions(
            session([first, second], transitions),
            "checkpoint-followup",
            new Set([first.intent_id])
        ).find((action) => action.transition.transition_id === "explore-portfolio");
        expect(allowed?.available).toBe(true);
        expect(allowed?.reason).toBeNull();
    });

    it("keeps legacy sessions actionable without exploration metadata", () => {
        const legacy = intent("legacy-credit", "credit", "checkpoint-consensus");
        const actions = replayLegalActions(
            session([legacy], []),
            "checkpoint-created",
            new Set()
        );

        expect(actions).toHaveLength(1);
        expect(actions[0].available).toBe(true);
        expect(actions[0].transition.transition_id).toBe(
            "legacy-legacy-credit"
        );
    });
});
