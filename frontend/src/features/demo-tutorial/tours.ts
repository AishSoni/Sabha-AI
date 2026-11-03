/**
 * Optional post-demo tours (spec-29).
 *
 * Both tours reuse the same HUD and the real workspace. Progress comes from
 * routes and real read outcomes, never from timers or simulated clicks.
 */
import type { TutorialPrompt, TutorialTourId } from "./contract";

export interface TourFacts {
    personaPromptViewed: boolean;
    personaRevisionViewed: boolean;
    knowledgePreviewed: boolean;
}

const PERSONA_ROUTE = /^\/demo\/roster\/(?!new$)[^/]+$/;
const PERSONA_HISTORY = /^\/demo\/roster\/[^/]+\/history$/;
const STACK_ROUTE = /^\/demo\/knowledge-stacks\/(?!new$)[^/]+$/;

export function isPersonaDetail(pathname: string): boolean {
    return PERSONA_ROUTE.test(pathname);
}

export function isPersonaHistory(pathname: string): boolean {
    return PERSONA_HISTORY.test(pathname);
}

export function isStackDetail(pathname: string): boolean {
    return STACK_ROUTE.test(pathname);
}

function promptTour(facts: TourFacts, pathname: string): TutorialPrompt {
    if (facts.personaRevisionViewed) {
        return {
            id: "tour-prompt-4",
            instruction: "Prompt tour complete",
            anchor: null,
            complete: true,
        };
    }
    if (isPersonaDetail(pathname) || isPersonaHistory(pathname)) {
        if (!facts.personaPromptViewed) {
            return {
                id: "tour-prompt-2",
                instruction: "Open its prompt versions",
                anchor: "persona.prompt",
            };
        }
        return {
            id: "tour-prompt-3",
            instruction: "View an earlier version",
            anchor: "persona.history",
        };
    }
    return {
        id: "tour-prompt-1",
        instruction: "Open a persona",
        anchor: "nav.personas",
    };
}

function knowledgeTour(facts: TourFacts, pathname: string): TutorialPrompt {
    if (facts.knowledgePreviewed) {
        return {
            id: "tour-knowledge-4",
            instruction: "Knowledge tour complete",
            anchor: null,
            complete: true,
        };
    }
    if (isStackDetail(pathname)) {
        return {
            id: "tour-knowledge-3",
            instruction: "Inspect a document",
            anchor: "stack.document",
            alternates: ["stack.access"],
        };
    }
    if (pathname === "/demo/knowledge-stacks") {
        return {
            id: "tour-knowledge-2",
            instruction: "Open a stack",
            anchor: "knowledge.stack",
        };
    }
    return {
        id: "tour-knowledge-1",
        instruction: "Open knowledge stacks",
        anchor: "nav.knowledge",
    };
}

export function selectTourPrompt(
    tour: TutorialTourId,
    facts: TourFacts,
    pathname: string
): TutorialPrompt {
    return tour === "prompt"
        ? promptTour(facts, pathname)
        : knowledgeTour(facts, pathname);
}
