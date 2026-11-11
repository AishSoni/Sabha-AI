import type { TutorialObjectiveId, TutorialPrompt } from "./contract";
import type { TutorialJourney } from "./journey";

/**
 * Progress is a position in the recorded journey, not an estimate of time or
 * an inference from motion. The main journey has ten named positions; each
 * optional tour has four. Speaker progress advances only after the room has
 * accepted a reply.
 */
export interface TutorialProgress {
    step: number;
    total: number;
    percent: number;
    /** Accessible description, for example `Step 4 of 10`. */
    label: string;
}

const MAIN_TOTAL = 10;
const DECK_TOTAL = 8;
const TOUR_TOTAL = 4;

const MAIN_STEPS: Readonly<
    Partial<Record<TutorialObjectiveId, number>>
> = {
    "main-start": 1,
    "main-create": 2,
    "main-open-room": 3,
    "main-speaker": 4,
    "main-followup": 5,
    "main-close": 6,
    "main-vote": 7,
    "main-return": 8,
    "main-archive": 9,
    "main-complete": 10,
};

const DECK_STEPS: Readonly<
    Partial<Record<TutorialObjectiveId, number>>
> = {
    "main-start": 1,
    "main-create": 2,
    "main-open-room": 3,
    "main-speaker": 4,
    "main-followup": 5,
    "main-close": 6,
    "main-vote": 7,
    "main-complete": 8,
};

const TOUR_STEPS: Readonly<
    Partial<Record<TutorialObjectiveId, number>>
> = {
    "tour-prompt-1": 1,
    "tour-prompt-2": 2,
    "tour-prompt-3": 3,
    "tour-prompt-4": 4,
    "tour-knowledge-1": 1,
    "tour-knowledge-2": 2,
    "tour-knowledge-3": 3,
    "tour-knowledge-4": 4,
};

function finish(step: number, total: number): TutorialProgress {
    const percent =
        step >= total ? 100 : Math.round((step / total) * 100);
    return {
        step,
        total,
        percent,
        label: `Step ${step} of ${total}`,
    };
}

/**
 * `main-speaker` is one position, but multiple required replies can land
 * before the prompt changes. Normalising the reply count keeps the bar moving
 * within that position instead of jumping by the number of participants.
 */
function mainSpeakerProgress(journey: TutorialJourney): TutorialProgress {
    const steps = journey.deck ? DECK_STEPS : MAIN_STEPS;
    const total = journey.deck ? DECK_TOTAL : MAIN_TOTAL;
    const required = Math.max(journey.requiredReplyCount, 0);
    const played = Math.min(Math.max(journey.replyCount, 0), required);
    const fraction = required > 0 ? played / required : 0;
    const continuous = steps["main-speaker"]! + fraction;
    return {
        step: steps["main-speaker"]!,
        total,
        percent: Math.round((continuous / total) * 100),
        label: `Step ${steps["main-speaker"]} of ${total}`,
    };
}

export function tutorialProgress(
    prompt: TutorialPrompt,
    journey: TutorialJourney
): TutorialProgress | null {
    const steps = journey.deck ? DECK_STEPS : MAIN_STEPS;
    const total = journey.deck ? DECK_TOTAL : MAIN_TOTAL;
    const mainStep = steps[prompt.id];
    if (mainStep !== undefined) {
        if (prompt.id === "main-speaker") return mainSpeakerProgress(journey);
        return finish(mainStep, total);
    }

    const tourStep = TOUR_STEPS[prompt.id];
    if (tourStep !== undefined) return finish(tourStep, TOUR_TOTAL);

    return null;
}
