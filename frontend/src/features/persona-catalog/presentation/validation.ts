/**
 * Pure persona-template validation shared by the live and demo screens.
 *
 * Mirrors the backend's `validate_template_request` rules so the same form
 * behaves the same way in both compositions. The live backend remains the
 * authority for live writes; the demo transport applies the same rules before
 * committing browser memory.
 */

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface PersonaTemplateFields {
    name?: string | null;
    subtitle?: string | null;
    color?: string | null;
}

export function validatePersonaTemplate(fields: PersonaTemplateFields): string[] {
    const problems: string[] = [];
    if (fields.name !== undefined && fields.name !== null) {
        const name = fields.name.trim();
        if (!name) problems.push("name must not be empty");
        if (name.length > 100) problems.push("name must be at most 100 characters");
    }
    if (
        fields.subtitle !== undefined &&
        fields.subtitle !== null &&
        fields.subtitle.length > 200
    ) {
        problems.push("subtitle must be at most 200 characters");
    }
    if (
        fields.color !== undefined &&
        fields.color !== null &&
        !HEX_COLOR.test(fields.color)
    ) {
        problems.push("color must be a hex swatch like #6366f1");
    }
    return problems;
}

export function normalizeStackIds(
    stackIds: readonly string[] | null | undefined
): string[] {
    return [...new Set(stackIds ?? [])];
}
