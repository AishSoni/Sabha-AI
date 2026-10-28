import { describe, expect, it } from 'vitest';
import type { ClosingView } from '../api/closing-decoders';
import {
    applyClosingTextItem,
    createClosingTextState,
    findClosingBallotText,
    findClosingSummaryText,
    isRecordedClosingText,
    snapshotClosingText,
    type ClosingTextItem,
} from './closing-text';

const CLOSING_ID = '44444444-4444-4444-8444-444444444444';

function item(overrides: Partial<ClosingTextItem> = {}): ClosingTextItem {
    return {
        closingId: CLOSING_ID,
        itemId: 'ballot:investor',
        kind: 'ballot',
        sequence: 0,
        text: 'Yes.',
        provisional: true,
        terminal: false,
        result: null,
        provenance: 'recorded-stream',
        subjectId: 'investor',
        ...overrides,
    };
}

function closingView(overrides: Partial<ClosingView> = {}): ClosingView {
    return {
        meeting_id: '11111111-1111-4111-8111-111111111111',
        meeting_status: 'voting',
        archived: false,
        closing_id: CLOSING_ID,
        request_key: 'request-key',
        mode: 'vote',
        stage: 'voting',
        failed_from_stage: null,
        votes: [],
        summary: null,
        summary_message_id: null,
        error: null,
        retryable: false,
        abortable: true,
        created_at: '2026-10-22T09:59:00Z',
        updated_at: '2026-10-22T10:00:00Z',
        completed_at: null,
        ...overrides,
    } as ClosingView;
}

describe('closing text projection', () => {
    it('projects live snapshot reasons and the final summary into terminal items', () => {
        const view = snapshotClosingText(
            closingView({
                votes: [
                    {
                        participant_id: 'investor',
                        participant_name: 'The Investor',
                        vote: true,
                        reason: 'ROI is clear.',
                        status: 'completed',
                    },
                    {
                        participant_id: 'cto',
                        participant_name: 'The CTO',
                        vote: false,
                        reason: 'The migration is not ready.',
                        status: 'completed',
                    },
                ],
                summary: 'We ship on Friday.',
                summary_message_id: 'summary-message',
            })
        );

        expect(view?.closingId).toBe(CLOSING_ID);
        expect(view?.provenance).toBe('live-snapshot');
        expect(view?.items).toHaveLength(3);
        expect(view?.items[0]).toMatchObject({
            itemId: 'ballot:investor',
            kind: 'ballot',
            sequence: 0,
            result: 'yes',
            terminal: true,
            provisional: false,
        });
        expect(view?.items[2]).toMatchObject({
            itemId: 'summary:summary-message',
            kind: 'summary',
            result: 'completed',
        });
    });

    it('returns no projection when the meeting has no closing identity', () => {
        expect(snapshotClosingText(closingView({ closing_id: null }))).toBeNull();
    });

    it('replaces provisional text with one canonical item and sorts by sequence', () => {
        let state = createClosingTextState(CLOSING_ID, 'recorded-stream');
        state = applyClosingTextItem(
            state,
            item({
                itemId: 'summary:final',
                kind: 'summary',
                sequence: 4,
                text: 'second',
            })
        );
        state = applyClosingTextItem(state, item({ sequence: 1, text: 'fi' }));
        state = applyClosingTextItem(state, item({ sequence: 2, text: 'fin' }));
        state = applyClosingTextItem(
            state,
            item({
                sequence: 3,
                text: 'final ballot text',
                provisional: false,
                terminal: true,
                result: 'yes',
            })
        );

        expect(state.items).toHaveLength(2);
        expect(state.items[0]).toMatchObject({
            itemId: 'ballot:investor',
            sequence: 3,
            text: 'final ballot text',
            terminal: true,
        });
        expect(state.items[1].sequence).toBe(4);
    });

    it('ignores duplicates, stale sequences, and late provisional text after terminal', () => {
        const terminal = item({
            sequence: 2,
            text: 'canonical',
            provisional: false,
            terminal: true,
        });
        let state = createClosingTextState(CLOSING_ID, 'recorded-stream');
        state = applyClosingTextItem(state, terminal);

        const afterDuplicate = applyClosingTextItem(state, terminal);
        const afterProvisional = applyClosingTextItem(
            state,
            item({ sequence: 3, text: 'late provisional' })
        );

        expect(afterDuplicate).toBe(state);
        expect(afterProvisional).toBe(state);
        expect(state.items[0].text).toBe('canonical');
    });

    it('rejects a different closing and a different provenance', () => {
        const state = createClosingTextState(CLOSING_ID, 'recorded-stream');

        expect(
            applyClosingTextItem(
                state,
                item({ closingId: 'another-closing', text: 'wrong closing' })
            )
        ).toBe(state);
        expect(
            applyClosingTextItem(
                state,
                item({ provenance: 'live-snapshot', text: 'wrong provenance' })
            )
        ).toBe(state);
        expect(state.items).toHaveLength(0);
    });

    it('rejects malformed sequence and provisional state', () => {
        const state = createClosingTextState(CLOSING_ID, 'recorded-stream');

        expect(applyClosingTextItem(state, item({ sequence: -1 }))).toBe(state);
        expect(applyClosingTextItem(state, item({ sequence: 1.5 }))).toBe(state);
        expect(
            applyClosingTextItem(state, item({ provisional: false, terminal: false }))
        ).toBe(state);
        expect(
            applyClosingTextItem(state, item({ provisional: true, terminal: true }))
        ).toBe(state);
    });

    it('resolves ballots by subject or item id and summaries by kind', () => {
        let state = createClosingTextState(CLOSING_ID, 'recorded-stream');
        state = applyClosingTextItem(state, item({ text: 'Ballot reason' }));
        state = applyClosingTextItem(
            state,
            item({
                itemId: 'summary-item',
                kind: 'summary',
                sequence: 1,
                text: 'Final brief',
                provisional: false,
                terminal: true,
                result: 'completed',
            })
        );

        expect(findClosingBallotText(state, 'investor')?.text).toBe('Ballot reason');
        expect(findClosingSummaryText(state)?.text).toBe('Final brief');
        expect(isRecordedClosingText(state)).toBe(true);
        expect(
            isRecordedClosingText(snapshotClosingText(closingView())!)
        ).toBe(false);
    });
});
