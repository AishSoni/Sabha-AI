import { describe, expect, it } from "vitest";
import type { ReplayBeat } from "@/features/meetings/runtime/contract";
import { selectPrompt, refineOnRoute } from "./objectives";
import type { TutorialJourney } from "./journey";

function journey(overrides: Partial<TutorialJourney> = {}): TutorialJourney {
    return {
        meetingCreated: false,
        replyCount: 0,
        requiredReplyCount: 4,
        followUpSent: false,
        canClose: false,
        closingCompleted: false,
        roomVisited: false,
        listOpen: false,
        archived: false,
        ended: false,
        deck: true,
        tab: null,
        settledIntents: new Set<string>(),
        beats: [],
        ...overrides,
    };
}

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

const LEGACY_BEATS: ReplayBeat[] = [
    beat({
        beat_id: "meet-the-board",
        ordinal: 1,
        route: "board",
        anchor: "board-roster",
        steps: [
            {
                step_id: "inspect-board",
                label: "Inspect the board",
                intent_id: null,
                completion: "acknowledge",
                requires_tab: "roster",
            },
        ],
    }),
    beat({
        beat_id: "establish-facts",
        ordinal: 3,
        route: "meeting",
        anchor: "credit-analyst-action",
        steps: [
            {
                step_id: "credit",
                label: "Ask the Credit Analyst",
                intent_id: "credit-analyst",
                completion: "turn_terminal",
                requires_tab: null,
            },
        ],
    }),
    beat({
        beat_id: "challenge-the-case",
        ordinal: 4,
        route: "meeting",
        anchor: "downside-reviewer-action",
        steps: [
            {
                step_id: "downside",
                label: "Ask the Downside Reviewer",
                intent_id: "downside-reviewer",
                completion: "turn_terminal",
                requires_tab: null,
            },
            {
                step_id: "review",
                label: "Review the disagreement",
                intent_id: null,
                completion: "acknowledge",
                requires_tab: "disagreements",
            },
        ],
    }),
    beat({
        beat_id: "align",
        ordinal: 6,
        route: "meeting",
        anchor: "consensus-action",
        steps: [
            {
                step_id: "concluding",
                label: "Ask the committee to align",
                intent_id: "concluding-discussion",
                completion: "turn_terminal",
                requires_tab: null,
            },
            {
                step_id: "review-consensus",
                label: "Review the consensus",
                intent_id: null,
                completion: "acknowledge",
                requires_tab: "consensus",
            },
        ],
    }),
];

describe("selectPrompt", () => {
    it("starts on the board with the real start control", () => {
        expect(selectPrompt(journey())).toMatchObject({
            id: "main-start",
            instruction: "Start the meeting",
            anchor: "demo.start",
        });
    });

    it("switches to the create control on the prepared setup route", () => {
        expect(refineOnRoute(selectPrompt(journey()), "/demo/new")).toMatchObject(
            {
                id: "main-create",
                instruction: "Create the recorded meeting",
                anchor: "demo.create",
            }
        );
    });

    it("asks for the room once the recording exists", () => {
        expect(
            selectPrompt(journey({ meetingCreated: true }))
        ).toMatchObject({
            id: "main-open-room",
            anchor: "demo.open-room",
        });
    });

    it("keeps the speaker objective while replies remain", () => {
        expect(
            selectPrompt(
                journey({ meetingCreated: true, roomVisited: true, replyCount: 2 })
            )
        ).toMatchObject({
            id: "main-speaker",
            instruction: "Choose who speaks next",
            anchor: "room.speaker",
            progress: "2 of 4 replies",
        });
    });

    it("accepts an early follow-up without renaming the speaker step", () => {
        const prompt = selectPrompt(
            journey({
                meetingCreated: true,
                roomVisited: true,
                replyCount: 1,
                followUpSent: true,
            })
        );
        expect(prompt?.id).toBe("main-speaker");
    });

    it("selects the follow-up only after all four replies", () => {
        expect(
            selectPrompt(
                journey({
                    meetingCreated: true,
                    roomVisited: true,
                    replyCount: 4,
                })
            )
        ).toMatchObject({
            id: "main-followup",
            instruction: "Send your follow-up",
            anchor: "room.followup",
        });
    });

    it("skips the follow-up prompt when it was sent earlier", () => {
        expect(
            selectPrompt(
                journey({
                    meetingCreated: true,
                    roomVisited: true,
                    replyCount: 4,
                    followUpSent: true,
                    canClose: true,
                })
            )?.id
        ).toBe("main-close");
    });

    it("never anchors a close control the room has not enabled", () => {
        expect(
            selectPrompt(
                journey({
                    meetingCreated: true,
                    roomVisited: true,
                    replyCount: 4,
                    followUpSent: true,
                    canClose: false,
                })
            )
        ).toBeNull();
    });

    it("points at the vote control inside the close panel", () => {
        expect(
            selectPrompt(
                journey({
                    meetingCreated: true,
                    roomVisited: true,
                    replyCount: 4,
                    followUpSent: true,
                    canClose: true,
                    tab: "closing",
                })
            )
        ).toMatchObject({
            id: "main-vote",
            anchor: "room.vote",
            alternates: ["room.vote-confirm"],
        });
    });

    it("returns to the list after the closing terminal", () => {
        expect(
            selectPrompt(
                journey({
                    meetingCreated: true,
                    roomVisited: true,
                    closingCompleted: true,
                })
            )
        ).toMatchObject({ id: "main-return", anchor: "room.return" });
    });

    it("archives from the real list once the meeting ended", () => {
        expect(
            selectPrompt(
                journey({
                    meetingCreated: true,
                    roomVisited: true,
                    closingCompleted: true,
                    ended: true,
                    listOpen: true,
                })
            )
        ).toMatchObject({ id: "main-archive", anchor: "meetings.archive" });
    });

    it("completes only after the archive took effect", () => {
        expect(
            selectPrompt(
                journey({
                    meetingCreated: true,
                    roomVisited: true,
                    closingCompleted: true,
                    ended: true,
                    listOpen: true,
                    archived: true,
                })
            )
        ).toMatchObject({ id: "main-complete", complete: true });
    });

    it("stays complete regardless of the open route", () => {
        expect(selectPrompt(journey({ archived: true }))?.id).toBe(
            "main-complete"
        );
    });
});

describe("selectPrompt on the legacy beat journey", () => {
    const base = journey({ deck: false, beats: LEGACY_BEATS });

    it("meets the board before the recording exists", () => {
        expect(selectPrompt(base)).toMatchObject({
            instruction: "Meet the board",
            anchor: "board.roster",
        });
    });

    it("moves on once the recording exists", () => {
        expect(
            selectPrompt(
                journey({
                    deck: false,
                    beats: LEGACY_BEATS,
                    meetingCreated: true,
                })
            )?.instruction
        ).toBe("Open the meeting room");
    });

    it("asks for the named participant action", () => {
        expect(
            selectPrompt(
                journey({
                    deck: false,
                    beats: LEGACY_BEATS,
                    meetingCreated: true,
                    roomVisited: true,
                })
            )
        ).toMatchObject({
            instruction: "Ask the Credit Analyst",
            anchor: "action.credit-analyst",
        });
    });

    it("does not hold the journey on an unread review", () => {
        const prompt = selectPrompt(
            journey({
                deck: false,
                beats: LEGACY_BEATS,
                meetingCreated: true,
                roomVisited: true,
                settledIntents: new Set(["credit-analyst", "downside-reviewer"]),
            })
        );
        expect(prompt).toMatchObject({
            id: "main-speaker",
            instruction: "Ask the committee to align",
            anchor: "action.consensus",
        });
    });

    it("still completes the legacy actions without visiting either review tab", () => {
        const prompt = selectPrompt(
            journey({
                deck: false,
                beats: LEGACY_BEATS,
                meetingCreated: true,
                roomVisited: true,
                settledIntents: new Set([
                    "credit-analyst",
                    "downside-reviewer",
                    "concluding-discussion",
                ]),
            })
        );
        expect(prompt).toMatchObject({ id: "main-close", anchor: "room.close" });
    });
});
