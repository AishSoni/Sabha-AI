import { describe, expect, it } from "vitest";
import { selectTourPrompt, type TourFacts } from "./tours";

function facts(overrides: Partial<TourFacts> = {}): TourFacts {
    return {
        personaPromptViewed: false,
        personaRevisionViewed: false,
        knowledgePreviewed: false,
        ...overrides,
    };
}

describe("prompt-version tour", () => {
    it("starts from the real Personas nav link", () => {
        expect(selectTourPrompt("prompt", facts(), "/demo")).toMatchObject({
            id: "tour-prompt-1",
            instruction: "Open a persona",
            anchor: "nav.personas",
        });
    });

    it("opens the prompt tab once a persona is on screen", () => {
        expect(
            selectTourPrompt("prompt", facts(), "/demo/roster/persona-1")
        ).toMatchObject({
            id: "tour-prompt-2",
            anchor: "persona.prompt",
        });
    });

    it("offers an earlier revision after the prompt tab was viewed", () => {
        expect(
            selectTourPrompt(
                "prompt",
                facts({ personaPromptViewed: true }),
                "/demo/roster/persona-1"
            )
        ).toMatchObject({
            id: "tour-prompt-3",
            anchor: "persona.history",
        });
    });

    it("completes only after a revision was viewed", () => {
        expect(
            selectTourPrompt(
                "prompt",
                facts({
                    personaPromptViewed: true,
                    personaRevisionViewed: true,
                }),
                "/demo/roster/persona-1"
            )
        ).toMatchObject({ id: "tour-prompt-4", complete: true });
    });

    it("does not complete on the history route alone", () => {
        expect(
            selectTourPrompt("prompt", facts(), "/demo/roster/persona-1/history")
        ).toMatchObject({ id: "tour-prompt-2" });
    });
});

describe("knowledge-stack tour", () => {
    it("starts from the Knowledge nav link", () => {
        expect(selectTourPrompt("knowledge", facts(), "/demo")).toMatchObject({
            id: "tour-knowledge-1",
            anchor: "nav.knowledge",
        });
    });

    it("points at a real stack link on the list", () => {
        expect(
            selectTourPrompt("knowledge", facts(), "/demo/knowledge-stacks")
        ).toMatchObject({
            id: "tour-knowledge-2",
            anchor: "knowledge.stack",
        });
    });

    it("points at a document once the stack is open", () => {
        expect(
            selectTourPrompt(
                "knowledge",
                facts(),
                "/demo/knowledge-stacks/stack-1"
            )
        ).toMatchObject({
            id: "tour-knowledge-3",
            anchor: "stack.document",
            alternates: ["stack.access"],
        });
    });

    it("completes only after a document preview was opened", () => {
        expect(
            selectTourPrompt(
                "knowledge",
                facts({ knowledgePreviewed: true }),
                "/demo/knowledge-stacks/stack-1"
            )
        ).toMatchObject({ id: "tour-knowledge-4", complete: true });
    });

    it("does not treat the stack route as a completed tour", () => {
        expect(
            selectTourPrompt("knowledge", facts(), "/demo/knowledge-stacks/new")
        ).toMatchObject({ id: "tour-knowledge-1" });
    });
});
