import { describe, expect, it } from "vitest";
import type { TutorialJourney } from "./journey";
import { mainStageRoute, screenPromptFor } from "./screen-guidance";

function journey(overrides: Partial<TutorialJourney> = {}): TutorialJourney {
    return {
        meetingCreated: false,
        replyCount: 0,
        requiredReplyCount: 0,
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
        deck: false,
        tab: null,
        settledIntents: new Set(),
        beats: [],
        ...overrides,
    };
}

describe("screen guidance", () => {
    it.each([
        ["/demo", "screen-overview"],
        ["/demo/new", "screen-setup"],
        ["/demo/meetings", "screen-meetings"],
        ["/demo/meetings/abc", "screen-room"],
        ["/demo/roster", "screen-roster"],
        ["/demo/roster/mira", "screen-persona"],
        ["/demo/roster/mira/history", "screen-prompt-history"],
        ["/demo/roster/new", "screen-persona"],
        ["/demo/knowledge-stacks", "screen-knowledge"],
        ["/demo/knowledge-stacks/shared", "screen-stack"],
        ["/demo/knowledge-stacks/new", "screen-stack"],
        ["/demo/settings", "screen-settings"],
    ])("maps %s to %s", (pathname, expected) => {
        const prompt = screenPromptFor(pathname);
        expect(prompt?.id).toBe(expected);
        expect(prompt?.progress).toBeUndefined();
    });

    it("has no screen prompt outside the demo workspace", () => {
        expect(screenPromptFor("/")).toBeNull();
        expect(screenPromptFor("/meetings")).toBeNull();
    });

    it("routes the main journey to the screen that owns the next step", () => {
        expect(mainStageRoute(journey(), "m1")).toBe("/demo");
        expect(
            mainStageRoute(journey({ setupOpen: true }), "m1")
        ).toBe("/demo/new");
        expect(
            mainStageRoute(
                journey({ meetingCreated: true, roomVisited: true }),
                "m1"
            )
        ).toBe("/demo/meetings/m1");
        expect(
            mainStageRoute(
                journey({ roomVisited: true, closingCompleted: true }),
                "m1"
            )
        ).toBe("/demo/meetings/m1");
        expect(
            mainStageRoute(
                journey({
                    roomVisited: true,
                    closingCompleted: true,
                    listOpen: true,
                }),
                "m1"
            )
        ).toBe("/demo/meetings");
        expect(
            mainStageRoute(journey({ archived: true }), "m1")
        ).toBe("/demo/meetings");
    });
});
