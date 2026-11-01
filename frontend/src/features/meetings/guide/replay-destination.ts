import type {
    ReplayBeat,
    ReplayBeatStep,
    ReplayTransition,
} from "../runtime/contract";

/**
 * One coherent guided destination: an installed snapshot, a route, and the
 * tab that shows the evidence or action belonging to that snapshot.
 *
 * Resume, Back, Continue, Open current step, and chapter entry all use this
 * shape so the URL, the room tab, and the replay checkpoint cannot disagree.
 */
export interface GuidedBeatDestination {
    beat: ReplayBeat;
    checkpoint: string | null;
    href: string;
    tab: string | null;
}

export function replayBeatHref(
    beat: ReplayBeat,
    meetingId: string,
    tabOverride?: string | null
): string {
    if (beat.route === "board") return "/demo";
    if (beat.route === "new") return "/demo/new";
    if (beat.route === "list") return "/demo/meetings";
    const tab = tabOverride === undefined ? beat.tab : tabOverride;
    const query = tab ? `?tab=${encodeURIComponent(tab)}` : "";
    return `/demo/meetings/${encodeURIComponent(meetingId)}${query}`;
}

/**
 * Select the snapshot that can actually satisfy the next outstanding step.
 *
 * - an interrupted action restarts from its own prepared source;
 * - a pending review returns to the completed evidence snapshot and its
 *   required tab;
 * - a pending recorded action returns to its transition source, not the
 *   beat's coarse start checkpoint;
 * - a completed beat shows its completed snapshot.
 */
export function resolveGuidedBeatDestination(
    beat: ReplayBeat,
    meetingId: string,
    transitions: readonly ReplayTransition[],
    options: {
        pendingStep?: ReplayBeatStep;
        interruptedIntentId?: string | null;
        /** Exploration Back inspects the state before a completed action. */
        preferStart?: boolean;
    } = {}
): GuidedBeatDestination {
    const pending = options.pendingStep;
    const interrupted = options.interruptedIntentId
        ? transitions.find(
              (transition) =>
                  transition.intent_id === options.interruptedIntentId
          )
        : undefined;
    const pendingTransition = pending?.intent_id
        ? transitions.find(
              (transition) => transition.intent_id === pending.intent_id
          )
        : undefined;

    const tab = pending?.requires_tab ?? beat.tab ?? null;
    let checkpoint: string | null;

    if (interrupted) {
        checkpoint = interrupted.source_checkpoint;
    } else if (pending?.completion === "acknowledge") {
        checkpoint = beat.completed_checkpoint ?? beat.checkpoint ?? null;
    } else if (pendingTransition) {
        checkpoint = pendingTransition.source_checkpoint;
    } else if (pending?.intent_id) {
        checkpoint = beat.start_checkpoint ?? beat.checkpoint ?? null;
    } else {
        checkpoint = beat.completed_checkpoint ?? beat.checkpoint ?? null;
    }

    return {
        beat,
        checkpoint:
            options.preferStart && beat.start_checkpoint
                ? beat.start_checkpoint
                : checkpoint,
        href: replayBeatHref(beat, meetingId, tab),
        tab,
    };
}

export function destinationIncludesLocation(
    destination: GuidedBeatDestination,
    pathname: string,
    searchTab: string | null
): boolean {
    const target = new URL(destination.href, "http://sabha.local");
    return (
        pathname === target.pathname &&
        searchTab === target.searchParams.get("tab")
    );
}
