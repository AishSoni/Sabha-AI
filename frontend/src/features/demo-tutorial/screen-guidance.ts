/**
 * Screen-level guidance for the demo workspace (spec-41).
 *
 * These prompts explain what a screen is for and what a choice changes. They
 * are not objectives: they never carry numeric progress, never complete the
 * journey, and never depend on a timer or a route render. The shared HUD
 * remains the only presentation owner.
 */
import type { TutorialJourney } from "./journey";
import type { TutorialAnchorId, TutorialPrompt } from "./contract";

const PERSONA_DETAIL = /^\/demo\/roster\/(?!new$)[^/]+$/;
const PERSONA_HISTORY = /^\/demo\/roster\/[^/]+\/history$/;
const STACK_DETAIL = /^\/demo\/knowledge-stacks\/(?!new$)[^/]+$/;
const ROOM_ROUTE = /^\/demo\/meetings\/(?!new$)[^/]+$/;

function screen(
    id: TutorialPrompt["id"],
    instruction: string,
    detail: string,
    anchor: TutorialAnchorId | null,
    alternates?: readonly TutorialAnchorId[]
): TutorialPrompt {
    return {
        id,
        instruction,
        detail,
        anchor,
        ...(alternates ? { alternates } : {}),
    };
}

/**
 * The route that owns the current main-journey objective. When a visitor is
 * elsewhere, the route gets its own explanation instead of an unreachable
 * next-step prompt.
 */
export function mainStageRoute(
    journey: TutorialJourney,
    meetingId: string
): string {
    if (journey.archived) return "/demo/meetings";
    if (!journey.roomVisited) {
        return journey.setupOpen || journey.meetingCreated
            ? "/demo/new"
            : "/demo";
    }
    if (!journey.closingCompleted) {
        return `/demo/meetings/${meetingId}`;
    }
    return journey.listOpen
        ? "/demo/meetings"
        : `/demo/meetings/${meetingId}`;
}

export function screenPromptFor(
    pathname: string
): TutorialPrompt | null {
    if (pathname === "/demo/settings") {
        return screen(
            "screen-settings",
            "The demo is isolated by design",
            "Providers are operator-only in live, browser changes disappear on refresh or reset, and the example is historical.",
            "settings.providers",
            ["settings.lifetime"]
        );
    }
    if (pathname === "/demo/roster") {
        return screen(
            "screen-roster",
            "Templates, not meeting participants",
            "Editing a persona changes future practice setups only; captured participant snapshots stay fixed.",
            "roster.persona"
        );
    }
    if (PERSONA_HISTORY.test(pathname)) {
        return screen(
            "screen-prompt-history",
            "Prompt history is versioned",
            "Viewing an earlier version is inspection, not activation; activating affects future meetings only.",
            "persona.history"
        );
    }
    if (PERSONA_DETAIL.test(pathname) || pathname === "/demo/roster/new") {
        return screen(
            "screen-persona",
            "A persona's prompt is its standing instruction",
            "The recorded participant snapshot is what this meeting actually used.",
            "persona.prompt"
        );
    }
    if (pathname === "/demo/knowledge-stacks") {
        return screen(
            "screen-knowledge",
            "Shared evidence and private workspaces",
            "Shared stacks are visible to the room; private stacks stay with their assigned participant. Counts come from the current browser state.",
            "knowledge.stack"
        );
    }
    if (STACK_DETAIL.test(pathname) || pathname === "/demo/knowledge-stacks/new") {
        return screen(
            "screen-stack",
            "Documents stay within this stack's scope",
            "Removing a document revokes its eligibility in this browser; the recorded meeting and its citations are unchanged.",
            "stack.document",
            ["stack.access"]
        );
    }
    if (ROOM_ROUTE.test(pathname)) {
        return screen(
            "screen-room",
            "The room is discussion-first",
            "Choose who speaks next, inspect sources, and treat disagreement and consensus as part of the record.",
            "room.speaker"
        );
    }
    if (pathname === "/demo/meetings") {
        return screen(
            "screen-meetings",
            "Active, ended, and archived records",
            "Archive after the closing vote keeps the record. Archived meetings are read-only here.",
            "meetings.list"
        );
    }
    if (pathname === "/demo/new") {
        return screen(
            "screen-setup",
            "This is the recorded setup",
            "Create the meeting to unlock the room; practice edits stay in this browser and never alter the recording.",
            "screen.setup",
            ["demo.create"]
        );
    }
    if (pathname === "/demo") {
        return screen(
            "screen-overview",
            "The board is the meeting brief",
            "Participants and their shared or private evidence are fixed before the room opens. Opening a source never changes the recording.",
            "board.roster"
        );
    }
    return null;
}
