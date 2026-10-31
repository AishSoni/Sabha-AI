import { describe, expect, it } from "vitest";
import assembly from "../../../../tests/fixtures/demo/prompt-assembly.json";
import { composeSystemPrompt } from "./prompt";

describe("browser prompt assembly", () => {
    it("matches the backend composer fixture", () => {
        expect(
            composeSystemPrompt(
                assembly.base_instructions,
                assembly.persona_prompt
            )
        ).toBe(assembly.composed_prompt);
    });

    it("keeps the persona prompt when no base instructions are available", () => {
        expect(composeSystemPrompt(null, "Persona only")).toBe("Persona only");
    });
});
