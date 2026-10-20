/**
 * Cache identities for durable turns (spec-07).
 *
 * Every identity is meeting- or operation-scoped: observing or browsing one
 * meeting must never read, overwrite, or poll another meeting's queue.
 */
export const turnKeys = {
    /** All turn cache entries; useful for feature-wide invalidation. */
    all: ['turns'] as const,
    /** Queue-plus-recent history for one meeting. */
    list: (meetingId: string) => ['turns', 'meeting', meetingId] as const,
    /** Durable status for one operation. */
    detail: (meetingId: string, operationId: string) =>
        ['turns', 'meeting', meetingId, 'operation', operationId] as const,
};
