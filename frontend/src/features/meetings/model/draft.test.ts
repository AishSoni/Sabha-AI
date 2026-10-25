/**
 * Unit contract: pure operation-scope helpers.
 *
 * - operations carry the meeting they were started for;
 * - an operation is only current while its meeting is the one presented;
 * - drafts bump revision on EVERY content change (and never for no-op edits);
 * - the draft is cleared only on confirmed success of the same meeting with
 *   an unchanged revision;
 * - duplicate sends are blocked only for unchanged in-flight drafts.
 */
import { describe, expect, it } from 'vitest';
import {
    beginOperation,
    captureSentDraft,
    editDraft,
    initialDraft,
    isCurrent,
    isSameDraftInFlight,
    shouldClearAfterSend,
} from './draft';

describe('operations', () => {
    it('records the meeting an operation was started for', () => {
        const operation = beginOperation('meeting-1');
        expect(operation.meetingId).toBe('meeting-1');
        expect(typeof operation.operationId).toBe('string');
    });

    it('stamps distinct operation ids for successive runs', () => {
        const first = beginOperation('meeting-1');
        const second = beginOperation('meeting-1');
        expect(first.operationId).not.toBe(second.operationId);
    });

    it('an operation is current only while its own meeting is presented', () => {
        const operation = beginOperation('meeting-1');
        expect(isCurrent(operation, 'meeting-1')).toBe(true);
        expect(isCurrent(operation, 'meeting-2')).toBe(false);
        expect(isCurrent(operation, null)).toBe(false);
    });
});

describe('drafts', () => {
    it('starts empty at revision zero', () => {
        expect(initialDraft()).toEqual({ text: '', revision: 0 });
    });

    it('bumps the revision on every content change', () => {
        const draft = editDraft(initialDraft(), 'hello');
        expect(draft).toEqual({ text: 'hello', revision: 1 });

        const again = editDraft(draft, 'hello world');
        expect(again).toEqual({ text: 'hello world', revision: 2 });
    });

    it('never bumps the revision for a no-op edit', () => {
        const draft = editDraft(initialDraft(), 'hello');
        expect(editDraft(draft, 'hello')).toEqual({ text: 'hello', revision: 1 });
    });

    it('captures the sent snapshot (meeting + revision + text)', () => {
        const draft = editDraft(initialDraft(), 'hello');
        const sent = captureSentDraft('meeting-1', draft);
        expect(sent).toEqual({ meetingId: 'meeting-1', revision: 1, text: 'hello' });
    });
});

describe('duplicate-send guard', () => {
    it('blocks only when the same meeting has the same revision still in flight', () => {
        const sent = captureSentDraft('meeting-1', editDraft(initialDraft(), 'hello'));
        const inFlightDraft = editDraft(initialDraft(), 'hello');

        expect(isSameDraftInFlight(sent, 'meeting-1', inFlightDraft)).toBe(true);
        // A draft edited after the send has a new revision and may be sent.
        expect(
            isSameDraftInFlight(sent, 'meeting-1', editDraft(initialDraft(), 'hello again'))
        ).toBe(false);
        // A different meeting's draft is unrelated.
        expect(isSameDraftInFlight(sent, 'meeting-2', inFlightDraft)).toBe(false);
        // Without an accepted send nothing is blocked.
        expect(isSameDraftInFlight(null, 'meeting-1', inFlightDraft)).toBe(false);
    });
});

describe('after-send clearing', () => {
    const sent = captureSentDraft('meeting-1', editDraft(initialDraft(), 'hello'));

    it('clears on confirmed success with unchanged revision in the same meeting', () => {
        expect(
            shouldClearAfterSend(sent, 'confirmed', 'meeting-1', editDraft(initialDraft(), 'hello'))
        ).toBe(true);
    });

    it('never clears on failure', () => {
        expect(
            shouldClearAfterSend(sent, 'failed', 'meeting-1', editDraft(initialDraft(), 'hello'))
        ).toBe(false);
    });

    it('never clears when the user edited the draft during the send', () => {
        expect(
            shouldClearAfterSend(
                sent,
                'confirmed',
                'meeting-1',
                editDraft(initialDraft(), 'hello edited while in flight')
            )
        ).toBe(false);
    });

    it('never clears when navigation moved to another meeting', () => {
        expect(
            shouldClearAfterSend(sent, 'confirmed', 'meeting-2', editDraft(initialDraft(), 'hello'))
        ).toBe(false);
    });
});
