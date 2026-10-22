/**
 * Contract for the closing wire decoders (spec-08).
 *
 * The backend snapshot is the only source of closing progress; these tests
 * pin the stage vocabulary, nullable vote facts, and the durable receipt.
 */
import { describe, expect, it } from 'vitest';
import { DecodeError } from '@/shared/api/decode';
import {
    decodeClosingReceipt,
    decodeClosingView,
    isPollingClosingStage,
    isSettledClosingStage,
} from './closing-decoders';

const voteJson = {
    participant_id: 'p-1',
    participant_name: 'The Investor',
    role: 'Investor',
    status: 'voted',
    vote: false,
    reason: 'CAC is unproven.',
    provider: 'openrouter',
    model: 'anthropic/claude',
    usage_kind: 'reported',
    price_kind: 'provider',
    estimated_cost: 0.012,
    reported_cost: 0.01,
    error_code: null,
    error_message: null,
    completed_at: '2026-10-22T10:00:00Z',
};

const viewJson = {
    meeting_id: 'm-1',
    meeting_status: 'voting',
    archived: false,
    closing_id: 'closing-1',
    request_key: 'request-1',
    mode: 'vote',
    stage: 'voting',
    failed_from_stage: null,
    votes: [voteJson],
    summary: null,
    summary_message_id: null,
    error: null,
    retryable: false,
    abortable: true,
    created_at: '2026-10-22T09:59:00Z',
    updated_at: '2026-10-22T10:00:00Z',
    completed_at: null,
};

describe('decodeClosingView', () => {
    it('decodes progress, ballots, and known costs', () => {
        const view = decodeClosingView(viewJson, 'view');

        expect(view.stage).toBe('voting');
        expect(view.votes).toHaveLength(1);
        expect(view.votes[0]).toMatchObject({
            participant_name: 'The Investor',
            vote: false,
            estimated_cost: 0.012,
            reported_cost: 0.01,
        });
        expect(view.abortable).toBe(true);
        expect(view.retryable).toBe(false);
    });

    it('accepts an operation-less meeting snapshot', () => {
        const view = decodeClosingView(
            {
                ...viewJson,
                closing_id: null,
                request_key: null,
                mode: null,
                stage: null,
                votes: [],
                abortable: false,
            },
            'view'
        );

        expect(view.stage).toBeNull();
        expect(view.votes).toEqual([]);
    });

    it('rejects an unknown stage instead of treating it as progress', () => {
        expect(() =>
            decodeClosingView({ ...viewJson, stage: 'finishing' }, 'view')
        ).toThrow(DecodeError);
    });

    it('requires the full closing record shape', () => {
        const { archived: _archived, ...missing } = viewJson;
        expect(() => decodeClosingView(missing, 'view')).toThrow(
            /view\.archived: expected a boolean/
        );
    });
});

describe('decodeClosingReceipt', () => {
    it('requires a real stage and meeting status', () => {
        expect(
            decodeClosingReceipt(
                {
                    meeting_id: 'm-1',
                    closing_id: 'closing-1',
                    stage: 'draining',
                    meeting_status: 'voting',
                },
                'receipt'
            )
        ).toEqual({
            meeting_id: 'm-1',
            closing_id: 'closing-1',
            stage: 'draining',
            meeting_status: 'voting',
        });

        expect(() =>
            decodeClosingReceipt(
                { meeting_id: 'm-1', closing_id: 'closing-1', stage: null, meeting_status: 'active' },
                'receipt'
            )
        ).toThrow(/stage/);
    });
});

describe('stage classification', () => {
    it('polls only advancing stages and settles failures without a spinner', () => {
        expect(isPollingClosingStage('draining')).toBe(true);
        expect(isPollingClosingStage('summarizing')).toBe(true);
        expect(isPollingClosingStage('failed')).toBe(false);
        expect(isSettledClosingStage('failed')).toBe(true);
        expect(isSettledClosingStage('completed')).toBe(true);
        expect(isSettledClosingStage('voting')).toBe(false);
    });
});
