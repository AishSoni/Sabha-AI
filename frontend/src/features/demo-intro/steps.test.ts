import { describe, expect, it } from "vitest";
import {
    INTRO_STEPS,
    clampIntroStep,
    introStepAt,
} from "./steps";

describe("demo introduction script", () => {
    it("keeps the approved four-step order and one composition", () => {
        expect(INTRO_STEPS.map((step) => step.id)).toEqual([
            "sabha",
            "record",
            "example",
            "try",
        ]);
        expect(INTRO_STEPS.map((step) => step.visual)).toEqual([
            "constellation",
            "record",
            "term-sheet",
            "checklist",
        ]);
    });

    it("names the historical example and separates known from unknown", () => {
        const example = introStepAt(2);
        expect(example.title).toBe("A HDFC Bond Review Demo");
        expect(example.body).toContain("historical 2020");
        expect(example.body).toContain("Not investment advice");
    });

    it("clamps step navigation", () => {
        expect(clampIntroStep(-4)).toBe(0);
        expect(clampIntroStep(1)).toBe(1);
        expect(clampIntroStep(99)).toBe(INTRO_STEPS.length - 1);
        expect(introStepAt(99).id).toBe("try");
    });
});
