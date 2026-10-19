/**
 * Regression: streamed tool activity must stay correlated when an assistant
 * issues repeated same-name tool calls in one turn. Entries are keyed by the
 * call id from the backend; legacy events without ids still fall back to
 * name matching.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    api: {
        streamTurn: vi.fn<(...args: unknown[]) => unknown>(),
        getMeeting: vi.fn<(...args: unknown[]) => unknown>(),
        getDisagreements: vi.fn<(...args: unknown[]) => unknown>(),
        getConsensus: vi.fn<(...args: unknown[]) => unknown>(),
        getContextStats: vi.fn<(...args: unknown[]) => unknown>(),
    },
}));

vi.mock('@/lib/api', () => ({
    __esModule: true,
    api: mocks.api,
    default: mocks.api,
}));

import { useMeetingStore } from '@/stores/meetingStore';
import type { MeetingWithParticipants, StreamEvent } from '@/lib/api';

const MEETING_ID = 'meeting-1';
const PARTICIPANT_ID = 'participant-1';

function streamEvent(overrides: Partial<StreamEvent>): StreamEvent {
    return {
        type: 'tool_call',
        tool_name: 'search_knowledge_base',
        tool_arguments: { query: 'pricing' },
        ...overrides,
    } as StreamEvent;
}

function seedCurrentMeeting() {
    // The store only uses participants (name/color lookup) during streaming.
    useMeetingStore.setState({
        currentMeeting: {
            id: MEETING_ID,
            name: 'Policy Council',
            participants: [
                {
                    id: PARTICIPANT_ID,
                    name: 'The Analyst',
                    color: '#3b82f6',
                },
            ],
            messages: [],
        } as unknown as MeetingWithParticipants,
    });
}

beforeEach(() => {
    seedCurrentMeeting();
});

describe('streamed tool call correlation', () => {
    it('keys repeated same-name tool calls by their unique call ids', async () => {
        mocks.api.streamTurn.mockImplementation(async function* () {
            yield streamEvent({
                type: 'tool_call',
                tool_name: 'search_knowledge_base',
                tool_arguments: { query: 'first pricing' },
                tool_call_id: 'call-1',
            });
            yield streamEvent({
                type: 'tool_result',
                tool_name: 'search_knowledge_base',
                tool_result: 'Snapshot A',
                tool_call_id: 'call-1',
            });
            yield streamEvent({
                type: 'tool_call',
                tool_name: 'search_knowledge_base',
                tool_arguments: { query: 'second pricing' },
                tool_call_id: 'call-2',
            });
            yield streamEvent({
                type: 'tool_result',
                tool_name: 'search_knowledge_base',
                tool_result: 'Snapshot B',
                tool_call_id: 'call-2',
            });
        });

        await useMeetingStore.getState().executeTurnStreaming(PARTICIPANT_ID);

        const { streamingMessage } = useMeetingStore.getState();
        expect(streamingMessage).not.toBeNull();
        const calls = streamingMessage!.toolCalls;
        expect(calls).toHaveLength(2);
        expect(calls[0]!.id).toBe('call-1');
        expect(calls[1]!.id).toBe('call-2');
        expect(calls[0]!.result).toBe('Snapshot A');
        expect(calls[1]!.result).toBe('Snapshot B');
        expect(calls.forEach(c => expect(c.isExecuting).toBe(false)));
    });

    it('falls back to name matching for legacy events without call ids', async () => {
        mocks.api.streamTurn.mockImplementation(async function* () {
            yield streamEvent({
                type: 'tool_call',
                tool_name: 'log_consensus',
                tool_arguments: { topic: 'pricing' },
            });
            yield streamEvent({
                type: 'tool_result',
                tool_name: 'log_consensus',
                tool_result: 'Consensus recorded',
            });
        });

        await useMeetingStore.getState().executeTurnStreaming(PARTICIPANT_ID);

        const { streamingMessage } = useMeetingStore.getState();
        const calls = streamingMessage!.toolCalls;
        expect(calls).toHaveLength(1);
        expect(calls[0]!.name).toBe('log_consensus');
        expect(calls[0]!.result).toBe('Consensus recorded');
        expect(calls[0]!.isExecuting).toBe(false);
    });
});
