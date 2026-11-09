/**
 * The approved introduction script (spec-41, D01).
 *
 * Four short steps, one composition. Copy stays deliberately concrete: what
 * Sabha is, why the record is inspectable, what this historical example is,
 * and what a visitor can try. Finance details belong in the example step, not
 * in every heading.
 */
export type IntroStepId =
    | "sabha"
    | "record"
    | "example"
    | "try";

export type IntroVisualId =
    | "constellation"
    | "record"
    | "term-sheet"
    | "checklist";

export interface IntroStep {
    id: IntroStepId;
    eyebrow: string;
    title: string;
    body: string;
    visual: IntroVisualId;
}

export const INTRO_STORAGE_KEY = "sabha.demo.intro.v1";
export const INTRO_STORAGE_VALUE = "seen";

export const INTRO_STEPS: readonly IntroStep[] = [
    {
        id: "sabha",
        eyebrow: "The idea",
        title: "One director. Three expert minds.",
        body: "Sabha is a meeting you direct. You choose who speaks next while different AI expertise argues the same question.",
        visual: "constellation",
    },
    {
        id: "record",
        eyebrow: "The record",
        title: "Disagreement you can inspect.",
        body: "Arguments stay visible. Disagreements and consensus are logged, sources can be opened, and the meeting ends with a documented outcome rather than one answer.",
        visual: "record",
    },
    {
        id: "example",
        eyebrow: "The example",
        title: "A HDFC Bond Review Demo",
        body: "A historical 2020 HDFC debenture review. The terms and dated rating are checkable; the downside and portfolio mandate are judgment calls. That gap shows what Sabha makes visible: what is known, what is argued, and what is still unknown. Not investment advice.",
        visual: "term-sheet",
    },
    {
        id: "try",
        eyebrow: "Your turn",
        title: "What to try",
        body: "Open the shared fact sheet, choose who speaks next, read a disagreement, send a follow-up, and close with a research checklist. Personas, prompt history, knowledge stacks, and settings are there when you want to inspect how the meeting is assembled.",
        visual: "checklist",
    },
] as const;

export function introStepAt(index: number): IntroStep {
    const step = INTRO_STEPS[index];
    return step ?? INTRO_STEPS[INTRO_STEPS.length - 1];
}

export function clampIntroStep(index: number): number {
    return Math.min(Math.max(index, 0), INTRO_STEPS.length - 1);
}
