import { describe, expect, it } from "vitest";
import type { TutorialJourney } from "./journey";
import type { TutorialObjectiveId } from "./contract";
import { tutorialProgress } from "./progress";

function journey(overrides: Partial<TutorialJourney> = {}): TutorialJourney {
    return {
        meetingCreated: false,
        replyCount: 0,
        requiredReplyCount: 4,
        followUpSent: false,
        canClose: false,
        closingCompleted: false,
        roomVisited: false,
        setupOpen: false,
        intakeReady: false,
        boardOpen: true,
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

function prompt(id: TutorialObjectiveId) {
    return {
        id,
        instruction: "Instruction",
        anchor: null,
    } as const;
}

describe("tutorialProgress", () => {
    it("reports each main position from start through completion", () => {
        const trails = journey();
        expect(tutorialProgress(prompt("main-start"), trails)).toMatchObject({
            step: 1,
            total: 10,
            percent: 10,
            label: "Step 1 of 10",
        });
        expect(tutorialProgress(prompt("main-create"), trails)?.percent).toBe(20);
        expect(tutorialProgress(prompt("main-open-room"), trails)?.percent).toBe(
            30
        );
        expect(tutorialProgress(prompt("main-followup"), trails)?.percent).toBe(
            50
        );
        expect(tutorialProgress(prompt("main-vote"), trails)?.percent).toBe(70);
        expect(tutorialProgress(prompt("main-archive"), trails)?.percent).toBe(
            90
        );
        expect(tutorialProgress(prompt("main-complete"), trails)).toMatchObject({
            step: 10,
            percent: 100,
        });
    });

    it("moves within the speaker step as replies are accepted", () => {
        const base = journey({ requiredReplyCount: 4 });
        expect(
            tutorialProgress(prompt("main-speaker"), base)?.percent
        ).toBe(40);
        expect(
            tutorialProgress(
                prompt("main-speaker"),
                journey({ requiredReplyCount: 4, replyCount: 1 })
            )?.percent
        ).toBe(43);
        expect(
            tutorialProgress(
                prompt("main-speaker"),
                journey({ requiredReplyCount: 4, replyCount: 4 })
            )?.percent
        ).toBe(50);
    });

    it("does not divide by zero when no reply is required", () => {
        expect(
            tutorialProgress(
                prompt("main-speaker"),
                journey({ requiredReplyCount: 0, replyCount: 0 })
            )?.percent
        ).toBe(40);
    });

    it("reports both optional tours in four steps", () => {
        const trails = journey();
        expect(tutorialProgress(prompt("tour-prompt-1"), trails)?.percent).toBe(
            25
        );
        expect(tutorialProgress(prompt("tour-prompt-3"), trails)?.percent).toBe(
            75
        );
        expect(
            tutorialProgress(prompt("tour-prompt-4"), trails)
        ).toMatchObject({ step: 4, total: 4, percent: 100 });
        expect(
            tutorialProgress(prompt("tour-knowledge-2"), trails)?.percent
        ).toBe(50);
        expect(
            tutorialProgress(prompt("tour-knowledge-4"), trails)?.percent
        ).toBe(100);
    });

    it("returns no bar for an unmapped objective", () => {
        expect(
            tutorialProgress(
                { ...prompt("main-start"), id: "unknown" as TutorialObjectiveId },
                journey()
            )
        ).toBeNull();
    });
});
