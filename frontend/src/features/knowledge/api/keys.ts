/**
 * Canonical query keys for Knowledge (spec-09). Keys stay owned by this
 * feature so upload observation, stack reads, and document lists invalidate
 * without guessing identities elsewhere.
 */
export interface DocumentScopeKey {
    meetingId?: string | null;
    personaId?: string | null;
    stackId?: string | null;
}

function scopePart(scope: DocumentScopeKey): readonly [string, string] {
    if (scope.meetingId) return ['meeting', scope.meetingId];
    if (scope.personaId) return ['persona', scope.personaId];
    if (scope.stackId) return ['stack', scope.stackId];
    return ['unknown', ''];
}

export const documentKeys = {
    /** Root scope for blanket invalidation of anything document-shaped. */
    all: ['documents'] as const,
    /** All documents indexed into one meeting's shared knowledge. */
    meeting: (meetingId: string) => ['documents', 'meeting', meetingId] as const,
    persona: (personaId: string) => ['documents', 'persona', personaId] as const,
    stack: (stackId: string) => ['documents', 'stack', stackId] as const,
    scope: (scope: DocumentScopeKey) => ['documents', ...scopePart(scope)] as const,
    /** Durable progress for one accepted upload operation. */
    operation: (operationId: string) => ['documents', 'operation', operationId] as const,
};

export const stackKeys = {
    all: ['knowledge_stacks'] as const,
    list: (userId?: string) => ['knowledge_stacks', 'list', userId ?? null] as const,
    detail: (stackId: string) => ['knowledge_stacks', 'detail', stackId] as const,
};
