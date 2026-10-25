/**
 * Operation-scope helpers: pure identity + draft bookkeeping for async work
 * against a meeting.
 *
 * Evidence (spec-02 C1/C3): async operations were scoped only by the moment
 * they started, so a response for meeting A could land while the store already
 * presented meeting B (loadMeeting's Promise.all overwrote B's data; late
 * turns appended into B; streaming a left meeting kept mutating shared state).
 *
 * Every operation captures the meeting it started for; callers re-check with
 * `isCurrent` after each await before touching shared state. Draft helpers
 * pair with them so a send clears the composer only when the very same
 * revision was confirmed for the very same meeting.
 */

export interface Operation {
    /** Meeting the operation was started for. */
    meetingId: string;
    /** Unique per started operation, monotonic across the session. */
    operationId: string;
}

let operationCounter = 0;

export function beginOperation(meetingId: string): Operation {
    operationCounter += 1;
    return { meetingId, operationId: `op-${operationCounter}` };
}

/**
 * True when the operation's meeting is still the meeting the store presents.
 * Checked after every await that could race navigation.
 */
export function isCurrent(operation: Operation, currentMeetingId: string | null): boolean {
    return currentMeetingId !== null && currentMeetingId === operation.meetingId;
}

// --- Draft bookkeeping (composer input) --------------------------------------

export interface Draft {
    text: string;
    revision: number;
}

export interface SentDraft {
    meetingId: string;
    revision: number;
    /** Text at send time; guards against coincidental revision matches. */
    text: string;
}

export function initialDraft(): Draft {
    return { text: '', revision: 0 };
}

/** Pure editor: every content change bumps the revision; no-op edits do not. */
export function editDraft(draft: Draft, text: string): Draft {
    if (draft.text === text) {
        return draft;
    }
    return { text, revision: draft.revision + 1 };
}

/** Snapshot captured when a send is accepted for flight. */
export function captureSentDraft(meetingId: string, draft: Draft): SentDraft {
    return { meetingId, revision: draft.revision, text: draft.text };
}

/**
 * Duplicate-send guard: blocks only while the exact same draft revision of the
 * same meeting is still in flight. Once the user edits (revision moves) or the
 * meeting changes, a new send is legitimate.
 */
export function isSameDraftInFlight(
    sent: SentDraft | null,
    meetingId: string,
    draft: Draft
): boolean {
    return (
        sent !== null &&
        sent.meetingId === meetingId &&
        sent.revision === draft.revision &&
        sent.text === draft.text
    );
}

export type SendOutcome = 'confirmed' | 'failed';

/**
 * The composer may be cleared only when the send was confirmed AND the draft
 * has not been edited since (revision match) AND the user is still on the
 * meeting the send was accepted for.
 */
export function shouldClearAfterSend(
    sent: SentDraft,
    outcome: SendOutcome,
    currentMeetingId: string | null,
    draft: Draft
): boolean {
    return (
        outcome === 'confirmed' &&
        currentMeetingId !== null &&
        currentMeetingId === sent.meetingId &&
        draft.revision === sent.revision &&
        draft.text === sent.text
    );
}
