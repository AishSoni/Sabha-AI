/**
 * Cache identities for coordinated closing (spec-08).
 *
 * A closing record is meeting-scoped: observing one meeting must never read
 * or poll another meeting's close operation.
 */
export const closingKeys = {
    /** All closing cache entries; useful for feature-wide invalidation. */
    all: ['closings'] as const,
    /** Progress plus committed result for one meeting. */
    detail: (meetingId: string) => ['closings', 'meeting', meetingId] as const,
};
