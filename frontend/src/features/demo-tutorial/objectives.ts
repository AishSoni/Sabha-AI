/**
 * Prompt selector (spec-29).
 *
 * Exactly one objective is current. Selection reads tracked outcomes only; it
 * never mutates them, never redirects and never clicks a control.
 */
import type { ReplayBeat } from "@/features/meetings/presentation";
import {
    LEGACY_BEAT_ANCHORS,
    LEGACY_BEAT_COPY,
    beatStepSatisfied,
    sortBeats,
    type BeatProgressInput,
    type TutorialAnchorId,
    type TutorialPrompt,
} from "./contract";
import type { TutorialJourney } from "./journey";

function fromBeatAnchor(anchor: string | null): TutorialAnchorId | null {
    if (!anchor) return null;
    return LEGACY_BEAT_ANCHORS[anchor] ?? null;
}

export function beatProgress(journey: TutorialJourney): BeatProgressInput {
    return {
        settledIntents: journey.settledIntents,
        closingCompleted: journey.closingCompleted,
        beats: sortBeats(journey.beats),
    };
}

function beatById(journey: TutorialJourney, beatId: string) {
    const beats = sortBeats(journey.beats);
    const index = beats.findIndex((beat) => beat.beat_id === beatId);
    return index < 0 ? null : { beat: beats[index], index, beats };
}

/** The board is inspected before the recording exists; it never blocks. */
function legacyBoardPrompt(journey: TutorialJourney): TutorialPrompt | null {
    if (journey.meetingCreated) return null;
    if (!journey.boardOpen) return null;
    const entry = beatById(journey, "meet-the-board");
    if (!entry) return null;
    return {
        id: "main-start",
        instruction: "Meet the board",
        anchor: "board.roster",
    };
}

/**
 * Reviews are optional notices now, so a room beat is done once its recorded
 * actions are done. An ignored notice can never hold the journey.
 */
function actionStepsSatisfied(
    beat: ReplayBeat,
    input: BeatProgressInput,
    index: number
): boolean {
    return beat.steps
        .filter((step) => step.completion !== "acknowledge")
        .every((step) => beatStepSatisfied(step, beat, input, index));
}

function legacyRoomPrompt(journey: TutorialJourney): TutorialPrompt | null {
    const beats = sortBeats(journey.beats);
    const input = beatProgress(journey);
    for (let index = 0; index < beats.length; index += 1) {
        const beat = beats[index];
        if (beat.route !== "meeting") continue;
        if (actionStepsSatisfied(beat, input, index)) continue;

        const step = beat.steps.find(
            (candidate) =>
                candidate.completion !== "acknowledge" &&
                !beatStepSatisfied(candidate, beat, input, index)
        );
        if (step?.intent_id === "director-follow-up") {
            return {
                id: "main-followup",
                instruction: "Send your follow-up",
                anchor: "room.followup",
                alternates: ["action.portfolio-analyst"],
            };
        }
        return {
            id: "main-speaker",
            instruction: LEGACY_BEAT_COPY[beat.beat_id] ?? beat.title,
            anchor: fromBeatAnchor(beat.anchor),
        };
    }
    return null;
}

function deckMiddlePrompt(journey: TutorialJourney): TutorialPrompt | null {
    if (journey.replyCount < journey.requiredReplyCount) {
        return {
            id: "main-speaker",
            instruction: "Choose who speaks next",
            anchor: "room.speaker",
            progress: `${journey.replyCount} of ${journey.requiredReplyCount} replies`,
        };
    }
    if (!journey.followUpSent) {
        return {
            id: "main-followup",
            instruction: "Send your follow-up",
            anchor: "room.followup",
            alternates: ["room.speaker"],
        };
    }
    // Never point at the close control before the room accepts it.
    if (!journey.canClose) return null;
    if (journey.tab === "closing") {
        return {
            id: "main-vote",
            instruction: "Vote to end the meeting",
            anchor: "room.vote",
            alternates: ["room.vote-confirm"],
        };
    }
    return {
        id: "main-close",
        instruction: "Close the meeting",
        anchor: "room.close",
    };
}

function closingPrompt(journey: TutorialJourney): TutorialPrompt | null {
    if (journey.listOpen) {
        return journey.ended
            ? {
                  id: "main-archive",
                  instruction: "Archive the meeting",
                  anchor: "meetings.archive",
              }
            : null;
    }
    return {
        id: "main-return",
        instruction: "Return to the meetings list",
        anchor: "room.return",
    };
}

export function selectPrompt(journey: TutorialJourney): TutorialPrompt | null {
    if (journey.archived) {
        return {
            id: "main-complete",
            instruction: "Demo complete",
            anchor: null,
            complete: true,
        };
    }
    if (!journey.deck) {
        const board = legacyBoardPrompt(journey);
        if (board) return board;
    }
    if (!journey.meetingCreated) {
        return {
            id: "main-start",
            instruction: "Start the meeting",
            anchor: "demo.start",
            alternates: ["demo.create"],
        };
    }
    if (!journey.roomVisited) {
        return {
            id: "main-open-room",
            instruction: "Open the meeting room",
            anchor: "demo.open-room",
        };
    }
    if (!journey.closingCompleted) {
        if (journey.deck) return deckMiddlePrompt(journey);
        const legacy = legacyRoomPrompt(journey);
        if (legacy) return legacy;
        if (journey.tab === "closing") {
            return {
                id: "main-vote",
                instruction: "Vote to end the meeting",
                anchor: "room.vote",
                alternates: ["room.vote-confirm"],
            };
        }
        return {
            id: "main-close",
            instruction: "Close the meeting",
            anchor: "room.close",
        };
    }
    return closingPrompt(journey);
}

/**
 * `main-create` replaces `main-start` once the prepared setup route is open.
 */
export function refineOnRoute(
    prompt: TutorialPrompt | null,
    pathname: string
): TutorialPrompt | null {
    if (!prompt) return prompt;
    if (prompt.id === "main-start" && pathname === "/demo/new") {
        return {
            id: "main-create",
            instruction: "Create the recorded meeting",
            anchor: "demo.create",
        };
    }
    return prompt;
}
