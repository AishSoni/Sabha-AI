/**
 * Browser prompt assembly (spec-24).
 *
 * Mirrors the backend's `get_full_prompt`: the approved base instructions
 * come first, then the persona system prompt. No other text is injected.
 */
export function composeSystemPrompt(
    baseInstructions: string | null | undefined,
    personaPrompt: string
): string {
    if (!baseInstructions) return personaPrompt;
    return `${baseInstructions}\n\n${personaPrompt}`;
}
