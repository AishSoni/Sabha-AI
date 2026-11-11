/**
 * Contextual demo tutorial contract (spec-29).
 *
 * The HUD is presentation only. Objectives are named outcomes; anchors are
 * stable ids registered by the real controls. Nothing here mutates the
 * recording, the meeting or a practice workspace.
 */
import type { ReplayBeat, ReplayBeatStep } from "@/features/meetings/presentation";

/**
 * Every anchor is registered by a mounted control. A missing anchor suspends
 * the expanded card; it never advances the journey.
 */
export const TUTORIAL_ANCHOR_IDS = [
    "demo.start",
    "demo.create",
    "demo.open-room",
    "board.roster",
    "action.credit-analyst",
    "action.downside-reviewer",
    "action.portfolio-analyst",
    "action.consensus",
    "room.speaker",
    "room.followup",
    "room.close",
    "room.vote",
    "room.vote-confirm",
    "room.return",
    "room.outcome",
    "room.tab.disagreements",
    "room.tab.consensus",
    "meetings.archive",
    "meetings.list",
    "nav.personas",
    "nav.knowledge",
    "roster.persona",
    "persona.prompt",
    "persona.history",
    "knowledge.stack",
    "stack.document",
    "stack.access",
    "screen.setup",
    "settings.providers",
    "settings.lifetime",
] as const;

export type TutorialAnchorId = (typeof TUTORIAL_ANCHOR_IDS)[number];

/** Main-journey objectives. Tours own their own ids. */
export type TutorialObjectiveId =
    | "main-start"
    | "main-create"
    | "main-open-room"
    | "main-speaker"
    | "main-followup"
    | "main-close"
    | "main-vote"
    | "main-return"
    | "main-archive"
    | "main-complete"
    | "tour-prompt-1"
    | "tour-prompt-2"
    | "tour-prompt-3"
    | "tour-prompt-4"
    | "tour-knowledge-1"
    | "tour-knowledge-2"
    | "tour-knowledge-3"
    | "tour-knowledge-4"
    | "screen-overview"
    | "screen-setup"
    | "screen-meetings"
    | "screen-room"
    | "screen-roster"
    | "screen-persona"
    | "screen-prompt-history"
    | "screen-knowledge"
    | "screen-stack"
    | "screen-settings";

export type TutorialTourId = "prompt" | "knowledge";

export interface TutorialPrompt {
    /** Stable objective id. A change here is the only thing announced. */
    id: TutorialObjectiveId;
    instruction: string;
    /** One short consequence or value statement, never a second instruction. */
    detail?: string;
    anchor: TutorialAnchorId | null;
    /** Later candidates, used only when the previous anchor is not mounted. */
    alternates?: readonly TutorialAnchorId[];
    /** Optional short progress such as `2 of 4 replies`. */
    progress?: string;
    /** Completion copy shows the optional tours instead of an action. */
    complete?: boolean;
}

/** Legacy beat anchors are authored ids; map them onto the registry. */
export const LEGACY_BEAT_ANCHORS: Record<string, TutorialAnchorId> = {
    "board-roster": "board.roster",
    "creation-form": "demo.create",
    "credit-analyst-action": "action.credit-analyst",
    "downside-reviewer-action": "action.downside-reviewer",
    "portfolio-analyst-action": "action.portfolio-analyst",
    "consensus-action": "action.consensus",
    "closing-entry": "room.close",
    "meeting-list": "meetings.archive",
};

/** Short imperatives for the frozen v5 beat titles. */
export const LEGACY_BEAT_COPY: Record<string, string> = {
    "meet-the-board": "Meet the board",
    "start-the-meeting": "Create meeting",
    "establish-facts": "Ask the Credit Analyst",
    "challenge-the-case": "Ask the Downside Reviewer",
    "address-uncertainty": "Send your follow-up",
    align: "Ask the committee to align",
    "close-the-meeting": "Close the meeting",
    "archive-the-meeting": "Archive the meeting",
};

/**
 * A beat can contain two recorded actions (for example the follow-up and the
 * participant who answers it). The outstanding step therefore owns the copy,
 * with the beat title only as a fallback.
 */
export const LEGACY_STEP_COPY: Record<string, string> = {
    "create-meeting": "Create meeting",
    "credit-analyst": "Ask the Credit Analyst",
    "downside-reviewer": "Ask the Downside Reviewer",
    "portfolio-analyst": "Ask the Portfolio Analyst",
    "concluding-discussion": "Ask the committee to align",
    "close-meeting": "Close the meeting",
    "archive-meeting": "Archive the meeting",
};

/** Recorded intents that own a participant action region. */
export const INTENT_ANCHORS: Record<string, TutorialAnchorId> = {
    "credit-analyst": "action.credit-analyst",
    "downside-reviewer": "action.downside-reviewer",
    "portfolio-analyst": "action.portfolio-analyst",
    "concluding-discussion": "action.consensus",
    "prepared-credit": "action.credit-analyst",
    "prepared-downside": "action.downside-reviewer",
    "prepared-portfolio": "action.portfolio-analyst",
    "prepared-consensus": "action.consensus",
};

export function anchorForIntent(
    intentId: string | null | undefined
): TutorialAnchorId | null {
    if (!intentId) return null;
    return INTENT_ANCHORS[intentId] ?? null;
}

/** Beats that the shared opening / closing stages own instead. */
export const SHARED_BEAT_IDS: ReadonlySet<string> = new Set([
    "start-the-meeting",
    "close-the-meeting",
    "archive-the-meeting",
]);

export interface BeatProgressInput {
    settledIntents: ReadonlySet<string>;
    closingCompleted: boolean;
    beats: readonly ReplayBeat[];
}

export function beatStepSatisfied(
    step: ReplayBeatStep,
    beat: ReplayBeat,
    input: BeatProgressInput,
    beatIndex: number
): boolean {
    if (step.completion === "acknowledge") {
        // A later canonical action means the review window has passed; an
        // ignored notice must never block the journey.
        return input.beats
            .slice(beatIndex + 1)
            .some((later) =>
                later.steps.some(
                    (laterStep) =>
                        laterStep.intent_id !== null &&
                        input.settledIntents.has(laterStep.intent_id)
                )
            );
    }
    if (!step.intent_id || !input.settledIntents.has(step.intent_id)) {
        return false;
    }
    if (step.completion === "closing_completed" && !input.closingCompleted) {
        return false;
    }
    return true;
}

export function beatSatisfied(
    beat: ReplayBeat,
    input: BeatProgressInput,
    beatIndex: number
): boolean {
    return beat.steps.every((step) =>
        beatStepSatisfied(step, beat, input, beatIndex)
    );
}

/** The single outstanding legacy beat, or null when the list is complete. */
export function nextUnsatisfiedBeat(
    input: BeatProgressInput
): { beat: ReplayBeat; index: number } | null {
    const beats = sortBeats(input.beats);
    for (let index = 0; index < beats.length; index += 1) {
        if (!beatSatisfied(beats[index], input, index)) {
            return { beat: beats[index], index };
        }
    }
    return null;
}

export function sortBeats(beats: readonly ReplayBeat[]): ReplayBeat[] {
    return [...beats].sort((left, right) => {
        const a = left.ordinal ?? Number.MAX_SAFE_INTEGER;
        const b = right.ordinal ?? Number.MAX_SAFE_INTEGER;
        return a - b;
    });
}

/** The first outstanding step of a beat, in authored order. */
export function firstUnsatisfiedStep(
    beat: ReplayBeat,
    input: BeatProgressInput,
    beatIndex: number
): ReplayBeatStep | null {
    return (
        beat.steps.find(
            (step) => !beatStepSatisfied(step, beat, input, beatIndex)
        ) ?? null
    );
}
