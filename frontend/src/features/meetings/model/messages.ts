/**
 * Canonical message-cache merge helpers.
 *
 * A POST response can arrive after a GET already installed the same message.
 * Identity is the canonical message id, never content or arrival order.
 */
export function upsertMessageById<T extends { id: string }>(
    messages: T[],
    message: T
): T[] {
    const index = messages.findIndex((candidate) => candidate.id === message.id);
    if (index === -1) return [...messages, message];
    const next = messages.slice();
    next[index] = message;
    return next;
}
