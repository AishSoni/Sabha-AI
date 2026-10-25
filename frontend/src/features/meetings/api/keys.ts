/**
 * Canonical cache identities for the meetings feature (spec-05).
 *
 * Keys stay with the owning feature — no global registry. The root scope
 * allows a whole-feature invalidation; list and detail have their own
 * identities so cross-meeting navigation never blurs cache entries.
 */
export const meetingKeys = {
    /** Root scope for the meetings feature. */
    all: ['meetings'] as const,
    list: () => ['meetings', 'list'] as const,
    detail: (meetingId: string) => ['meetings', 'detail', meetingId] as const,
    disagreements: (meetingId: string) =>
        ['meetings', 'detail', meetingId, 'disagreements'] as const,
    consensus: (meetingId: string) => ['meetings', 'detail', meetingId, 'consensus'] as const,
    contextStats: (meetingId: string) =>
        ['meetings', 'detail', meetingId, 'context-stats'] as const,
};
