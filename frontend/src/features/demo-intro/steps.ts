/**
 * Approved introduction script and moment order (spec-41).
 *
 * The copy is the concise baseline from the addendum. Meaning that would
 * otherwise become a paragraph belongs in the spatial card composition.
 */
export type IntroStepId = "idea" | "value" | "try" | "example";

export interface IntroStep {
    id: IntroStepId;
    title: string;
    body: string;
    qualifier?: string;
}

export const INTRO_STORAGE_KEY = "sabha.demo.intro.v1";
export const INTRO_STORAGE_VALUE = "seen";

export const INTRO_STEPS: readonly IntroStep[] = [
    {
        id: "idea",
        title: "One question. Different minds.",
        body: "You direct the meeting. Choose which AI speaks next.",
    },
    {
        id: "value",
        title: "See where they disagree.",
        body: "Compare perspectives. Inspect sources. Keep the outcome.",
    },
    {
        id: "try",
        title: "Choose. Question. Explore.",
        body: "Choose who speaks, open a source, and ask a follow-up.",
    },
    {
        id: "example",
        title: "Clear facts. Different judgments.",
        body: "Explore an HDFC bond review from 2020 in this demo.",
        qualifier: "Historical example · Not investment advice.",
    },
] as const;

export function introStepAt(index: number): IntroStep {
    const step = INTRO_STEPS[index];
    return step ?? INTRO_STEPS[INTRO_STEPS.length - 1];
}

export function clampIntroStep(index: number): number {
    return Math.min(Math.max(index, 0), INTRO_STEPS.length - 1);
}
