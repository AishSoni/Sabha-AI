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
    LEGACY_STEP_COPY,
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
        if (!step) continue;
        if (step.intent_id === "director-follow-up") {
            return {
                id: "main-followup",
                instruction: "Send your follow-up",
                anchor: "room.followup",
                alternates: ["action.portfolio-analyst"],
            };
        }
        if (step.intent_id === "close-meeting") {
            return journey.tab === "closing"
                ? {
                      id: "main-vote",
                      instruction: "Vote to end the meeting",
                      anchor: "room.vote",
                      alternates: ["room.vote-confirm"],
                  }
                : {
                      id: "main-close",
                      instruction: "Close the meeting",
                      anchor: "room.close",
                  };
        }
        return {
            id: "main-speaker",
            instruction:
                (step.intent_id ? LEGACY_STEP_COPY[step.intent_id] : null) ??
                LEGACY_BEAT_COPY[beat.beat_id] ??
                beat.title,
            anchor: fromBeatAnchor(beat.anchor),
        };
    }
    return null;
}

function deckMiddlePrompt(journey: TutorialJourney): TutorialPrompt | null {
    const progress = journey.progressLabel;
    if (journey.phase === "opening" || journey.phase === "deliberation") {
        return {
            id: "main-speaker",
            instruction: "Choose who speaks next",
            detail: "You direct the room; replies are recorded, not live generation.",
            anchor: "room.speaker",
            progress,
        };
    }
    if (journey.phase === "follow-up") {
        return {
            id: "main-followup",
            instruction: "Send your follow-up",
            detail: "Keep the thread on the evidence and the unresolved question.",
            anchor: "room.followup",
            alternates: ["room.speaker"],
            progress,
        };
    }
    // Never point at the close control before the room accepts it.
    if (!journey.canClose) return null;
    if (journey.tab === "closing") {
        return {
            id: "main-vote",
            instruction: "Vote to end the meeting",
            detail: "The vote ends the meeting; it does not erase the record.",
            anchor: "room.vote",
            alternates: ["room.vote-confirm"],
            progress,
        };
    }
    return {
        id: "main-close",
        instruction: "Close the meeting",
        detail: "Closing records the decision and the research checklist.",
        anchor: "room.close",
        progress,
    };
}

function completePrompt(journey: TutorialJourney): TutorialPrompt {
    const archived = journey.archived;
    return {
        id: "main-complete",
        instruction: "Demo complete",
        detail: archived
            ? "The demo meeting is archived. Changes made in this browser stay here. Both tours are optional."
            : "The demo meeting is closed. The outcome and research checklist are saved; archiving is optional. Changes made in this browser stay here. Both tours are optional.",
        anchor: journey.roomOpen ? "room.outcome" : null,
        complete: true,
    };
}

function closingPrompt(journey: TutorialJourney): TutorialPrompt | null {
    if (journey.listOpen) {
        return journey.ended
            ? {
                  id: "main-archive",
                  instruction: "Archive the meeting",
                  detail: "Archiving keeps the completed record and moves it out of active work.",
                  anchor: "meetings.archive",
              }
            : null;
    }
    return {
        id: "main-return",
        instruction: "Return to the meetings list",
        detail: "The list holds the ended record for review.",
        anchor: "room.return",
    };
}

export function selectPrompt(journey: TutorialJourney): TutorialPrompt | null {
    if (journey.deck && journey.closingCompleted) {
        return completePrompt(journey);
    }
    if (journey.archived) {
        return completePrompt(journey);
    }
    if (!journey.deck) {
        const board = legacyBoardPrompt(journey);
        if (board) return board;
    }
    if (!journey.roomVisited) {
        if (journey.setupOpen) {
            return journey.intakeReady
                ? {
                      id: "main-open-room",
                      instruction: "Open the meeting room",
                      anchor: "demo.open-room",
                  }
                : {
                      id: "main-create",
                      instruction: "Create meeting",
                      detail: "This records the setup; practice edits never alter the recording.",
                      anchor: "demo.create",
                  };
        }
        if (journey.meetingCreated) {
            return {
                id: "main-open-room",
                instruction: "Open the meeting room",
                detail: "The room opens on the prepared discussion.",
                anchor: "demo.open-room",
            };
        }
        return {
            id: "main-start",
            instruction: "Start the meeting",
            detail: "The board shows who is in the room and what each participant can see.",
            anchor: "demo.start",
            alternates: ["demo.create"],
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
            instruction: "Create meeting",
            anchor: "demo.create",
        };
    }
    return prompt;
}
