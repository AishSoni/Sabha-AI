import { describe, expect, it } from "vitest";
import { INTRO_STEPS, clampIntroStep, introStepAt } from "./steps";

describe("demo introduction script", () => {
    it("keeps the approved four-moment order", () => {
        expect(INTRO_STEPS.map((step) => step.id)).toEqual([
            "idea",
            "value",
            "try",
            "example",
        ]);
    });

    it("uses the concise copy baseline and keeps the example last", () => {
        expect(INTRO_STEPS[0]?.title).toBe("One question. Different minds.");
        expect(INTRO_STEPS[1]?.title).toBe("See where they disagree.");
        expect(INTRO_STEPS[2]?.title).toBe("Choose. Question. Explore.");
        expect(INTRO_STEPS[3]?.title).toBe(
            "Clear facts. Different judgments."
        );
        expect(INTRO_STEPS[3]?.qualifier).toBe(
            "Historical example · Not investment advice."
        );
    });

    it("clamps journey positions", () => {
        expect(clampIntroStep(-4)).toBe(0);
        expect(clampIntroStep(1)).toBe(1);
        expect(clampIntroStep(99)).toBe(INTRO_STEPS.length - 1);
        expect(introStepAt(99).id).toBe("example");
    });
});
