/**
 * Canonical query keys for the persona catalog (spec-05). Keys stay owned by
 * this feature; roster screens and future catalog screens share identities
 * instead of ad-hoc arrays.
 */
export const personaKeys = {
    /** Root scope for blanket invalidation of anything persona-shaped. */
    all: ['personas'] as const,
    /** The list of personas offered when composing a meeting roster. */
    list: () => ['personas', 'list'] as const,
};
