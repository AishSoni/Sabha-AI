/**
 * Canonical query keys for documents (spec-05). Keys stay owned by this
 * feature so upgrades to the document reads later can invalidate without
 * guessing identities elsewhere.
 */
export const documentKeys = {
    /** Root scope for blanket invalidation of anything document-shaped. */
    all: ['documents'] as const,
    /** All documents indexed into one meeting's shared knowledge. */
    meeting: (meetingId: string) => ['documents', 'meeting', meetingId] as const,
};
