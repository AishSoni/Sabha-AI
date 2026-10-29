/**
 * Projection reducer contracts (spec-07).
 *
 * Replay is idempotent, tool identity is operation/invocation/call-scoped,
 * local EOF never becomes a server outcome, and a late event from another
 * operation can never mutate the projection being observed.
 */
import { describe, expect, it } from 'vitest';
import {
    applyTurnEvent,
    emptyTurnProjection,
    turnProjectionKey,
} from './turn-projection';
import type { TurnEvent } from './turn-events';

const scope = { meetingId: 'meeting-1', operationId: 'operation-1' };

function event(sequence: number, overrides: Partial<TurnEvent>): TurnEvent {
    return {
        type: 'text',
        meetingId: scope.meetingId,
        operationId: scope.operationId,
        eventId: `event-${sequence}`,
        sequence,
        ...overrides,
    };
}

function project(events: TurnEvent[]) {
    return events.reduce(
        (projection, current) => applyTurnEvent(projection, scope, current),
        emptyTurnProjection(scope, 'executing')
    );
}

describe('turn projection', () => {
    it('appends split text and ignores replayed sequences', () => {
        const projection = project([
            event(1, { type: 'status', status: 'executing' }),
            event(2, { content: 'Hel' }),
            event(2, { content: 'Hel' }),
            event(3, { content: 'lo' }),
        ]);

        expect(projection.text).toBe('Hello');
        expect(projection.lastSequence).toBe(3);
        expect(projection.status).toBe('executing');
    });

    it('correlates same-name tool calls and results by operation/invocation/call identity', () => {
        const projection = project([
            event(1, {
                type: 'tool_call',
                invocationId: 'inv-1',
                callId: 'call-a',
                toolName: 'search_knowledge_base',
                arguments: { query: 'first' },
            }),
            event(2, {
                type: 'tool_call',
                invocationId: 'inv-1',
                callId: 'call-b',
                toolName: 'search_knowledge_base',
                arguments: { query: 'second' },
            }),
            event(3, {
                type: 'tool_result',
                invocationId: 'inv-1',
                callId: 'call-a',
                toolName: 'search_knowledge_base',
                result: 'result for first',
            }),
            event(4, {
                type: 'tool_result',
                invocationId: 'inv-1',
                callId: 'call-b',
                toolName: 'search_knowledge_base',
                result: 'result for second',
                isError: false,
            }),
        ]);

        expect(projection.toolCalls).toHaveLength(2);
        expect(projection.toolCalls[0]).toMatchObject({
            callId: 'call-a',
            result: 'result for first',
            isExecuting: false,
        });
        expect(projection.toolCalls[1]).toMatchObject({
            callId: 'call-b',
            result: 'result for second',
            isExecuting: false,
        });
    });

    it('keeps a result visible when replay starts after its call', () => {
        const projection = project([
            event(1, {
                type: 'tool_result',
                invocationId: 'inv-1',
                callId: 'call-late',
                toolName: 'search_knowledge_base',
                result: { matches: 2 },
            }),
        ]);

        expect(projection.toolCalls[0]).toMatchObject({
            callId: 'call-late',
            result: { matches: 2 },
            isExecuting: false,
        });
    });

    it('carries citation identity through the transient projection', () => {
        const projection = project([
            event(1, {
                type: 'citation',
                source: 'knowledge',
                title: 'hdfc-fy20-mda.md',
                snippet: 'Net interest margin improved.',
                documentId: 'doc-1',
                revisionId: 'rev-2',
                chunkId: 'chunk-3',
                chunkIndex: 3,
                pageNumber: 7,
            }),
            event(2, {
                type: 'citation',
                source: 'CRISIL rating rationale',
                title: 'CRISIL Rating Rationale, 31 July 2020',
                claimId: 'C1',
                locator: 'S1 annexure row for ISIN INE001A07RW5',
            }),
        ]);

        expect(projection.citations).toEqual([
            expect.objectContaining({
                documentId: 'doc-1',
                revisionId: 'rev-2',
                chunkId: 'chunk-3',
                chunkIndex: 3,
                pageNumber: 7,
                claimId: null,
                locator: null,
            }),
            expect.objectContaining({
                claimId: 'C1',
                locator: 'S1 annexure row for ISIN INE001A07RW5',
                documentId: null,
                revisionId: null,
            }),
        ]);
    });

    it('records local EOF without claiming the server operation ended', () => {
        const projection = project([
            event(1, { content: 'partial' }),
            event(1, {
                type: 'interrupted',
                eventId: 'local-interruption',
                meetingId: '',
                operationId: '',
                code: 'observation_interrupted',
            }),
        ]);

        expect(projection.text).toBe('partial');
        expect(projection.status).toBe('executing');
        expect(projection.terminal).toBeNull();
        expect(projection.observationInterrupted).toBe(true);
    });

    it('freezes the projection at its terminal event', () => {
        const projection = project([
            event(1, { content: 'final' }),
            event(2, { type: 'done', messageId: 'message-1', estimatedCost: 0.02 }),
            event(3, { content: 'late duplicate' }),
        ]);

        expect(projection.text).toBe('final');
        expect(projection.status).toBe('completed');
        expect(projection.finalMessageId).toBe('message-1');
        expect(projection.estimatedCost).toBe(0.02);
        expect(projection.lastSequence).toBe(2);
    });

    it('rejects late events belonging to another operation', () => {
        const base = emptyTurnProjection(scope, 'executing');
        const late = applyTurnEvent(
            base,
            scope,
            event(1, { meetingId: 'meeting-2', operationId: 'operation-2', content: 'intruder' })
        );
        expect(late).toBe(base);
        expect(late.text).toBe('');
        expect(turnProjectionKey(scope)).not.toBe(
            turnProjectionKey({ meetingId: 'meeting-2', operationId: 'operation-1' })
        );
    });
});
