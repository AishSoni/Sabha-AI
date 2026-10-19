/**
 * Regression: async meeting operations must not leak results across
 * navigation.
 *
 * Evidence (spec-02 C1): loadMeeting's Promise.all had no identity guard, so a
 * load for meeting A that completed after switching to meeting B overwrote B's
 * data; late turn/message/stats completions appended into whatever meeting the
 * store currently showed; a streaming turn kept mutating shared state for a
 * meeting the user had already left.
 *
 * Determinism: no sleeps — deferred promise barriers resolve the order.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    api: {
        streamTurn: vi.fn(),
        getMeeting: vi.fn(),
        getDisagreements: vi.fn(),
        getConsensus: vi.fn(),
        getContextStats: vi.fn(),
        sendUserMessage: vi.fn(),
        executeTurn: vi.fn(),
    },
}));

vi.mock('@/lib/api', () => ({
    api: mocks.api,
    default: mocks.api,
}));

import { useMeetingStore } from '@/stores/meetingStore';
import type { MeetingWithParticipants, Message } from '@/lib/api';

const PARTICIPANT_ID = 'participant-1';

function deferred<T = unknown>() {
    let resolve!: (value: T) => void;
    let reject!: (error?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function makeMeeting(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        name: `Meeting ${id}`,
        participants: [{ id: PARTICIPANT_ID, name: 'The Analyst', color: '#3b82f6' }],
        messages: [],
        ...overrides,
    } as unknown as MeetingWithParticipants;
}

function makeMessage(id: string): Message {
    return {
        id,
        sender_type: 'user',
        sender_name: 'You',
        content: 'written',
    } as unknown as Message;
}

function resetStore() {
    useMeetingStore.setState({
        currentMeeting: null,
        disagreements: [],
        consensusList: [],
        isLoading: false,
        error: null,
        activeTurnParticipantId: null,
        activeTurnOperation: null,
        streamingMessage: null,
        contextStats: null,
        loadOperation: null,
        turnOperation: null,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
});

describe('superseded loads', () => {
    it('a late-resolving load never overwrites the newer load', async () => {
        const meetingA = deferred();
        const discourseA = deferred();
        const meetingB = deferred();
        const discourseB = deferred();

        mocks.api.getMeeting.mockImplementation(
            (meetingId: string) => (meetingId === 'meeting-a' ? meetingA.promise : meetingB.promise)
        );
        mocks.api.getDisagreements.mockImplementation(
            (meetingId: string) => (meetingId === 'meeting-a' ? discourseA.promise : discourseB.promise)
        );
        mocks.api.getConsensus.mockImplementation(
            (meetingId: string) => (meetingId === 'meeting-a' ? discourseA.promise : discourseB.promise)
        );
        mocks.api.getContextStats.mockImplementation(
            (meetingId: string) =>
                Promise.resolve(meetingId === 'meeting-a' ? { used_tokens: 11 } : { used_tokens: 22 })
        );

        const loadA = useMeetingStore.getState().loadMeeting('meeting-a');
        const loadB = useMeetingStore.getState().loadMeeting('meeting-b');

        meetingB.resolve(makeMeeting('meeting-b'));
        discourseB.resolve([]);
        await loadB;

        expect(useMeetingStore.getState().currentMeeting?.id).toBe('meeting-b');

        // A completes after B is already presented.
        meetingA.resolve(makeMeeting('meeting-a'));
        discourseA.resolve([{ id: 'stale-disagreement' }]);
        await loadA;

        expect(useMeetingStore.getState().currentMeeting?.id).toBe('meeting-b');
        expect(useMeetingStore.getState().currentMeeting?.name).toBe('Meeting meeting-b');
        expect(useMeetingStore.getState().disagreements).toEqual([]);
        expect(useMeetingStore.getState().contextStats).toEqual({ used_tokens: 22 });
        expect(useMeetingStore.getState().isLoading).toBe(false);
    });
});

describe('late user messages', () => {
    it('a user message confirmed after navigation does not pollute the new meeting', async () => {
        const send = deferred();
        mocks.api.sendUserMessage.mockReturnValue(send.promise);

        useMeetingStore.setState({ currentMeeting: makeMeeting('meeting-a') });
        const sendPromise = useMeetingStore.getState().sendUserMessage('hello from a');

        // Navigate away while the request is in flight.
        useMeetingStore.setState({ currentMeeting: makeMeeting('meeting-b') });

        send.resolve(makeMessage('late-message'));
        const confirmed = await sendPromise;

        expect(confirmed).toBe(false);
        const current = useMeetingStore.getState().currentMeeting!;
        expect(current.id).toBe('meeting-b');
        expect(current.messages).toHaveLength(0);
    });
});

describe('late non-streaming turns', () => {
    it('a turn completed after navigation does not pollute the new meeting', async () => {
        const turn = deferred();
        mocks.api.executeTurn.mockReturnValue(turn.promise);

        useMeetingStore.setState({ currentMeeting: makeMeeting('meeting-a') });
        const turnPromise = useMeetingStore.getState().executeTurn(PARTICIPANT_ID);

        // The user navigates and another participant is already at work on the
        // new meeting.
        useMeetingStore.setState({
            currentMeeting: makeMeeting('meeting-b'),
            activeTurnParticipantId: 'participant-2',
        });

        turn.resolve({
            message: makeMessage('late-turn-message'),
            disagreements: [{ id: 'stale' }],
            consensus: [],
        });
        await turnPromise;

        const store = useMeetingStore.getState();
        const current = store.currentMeeting!;
        expect(current.id).toBe('meeting-b');
        expect(current.messages).toHaveLength(0);
        expect(store.disagreements).toEqual([]);
        // The stale turn must not clear the new meeting's active turn state.
        expect(store.activeTurnParticipantId).toBe('participant-2');
    });
});

describe('abandoned streaming turns', () => {
    it('stream events from a previous meeting never land in the current meeting', async () => {
        const gateA = deferred();
        const gateB = deferred();
        mocks.api.streamTurn.mockImplementation(async function* (meetingId: string) {
            if (meetingId === 'meeting-a') {
                yield { type: 'text', content: 'still on a' };
                await gateA.promise;
                yield { type: 'done', message_id: 'm-a' };
                return;
            }
            yield { type: 'text', content: 'on b' };
            await gateB.promise;
        });
        mocks.api.getMeeting.mockResolvedValue(makeMeeting('meeting-a'));
        mocks.api.getDisagreements.mockResolvedValue([]);
        mocks.api.getConsensus.mockResolvedValue([]);
        mocks.api.getContextStats.mockResolvedValue({ used_tokens: 11 });

        useMeetingStore.setState({ currentMeeting: makeMeeting('meeting-a') });
        const runA = useMeetingStore.getState().executeTurnStreaming(PARTICIPANT_ID);

        await waitFor(() =>
            expect(useMeetingStore.getState().streamingMessage?.content).toBe('still on a')
        );

        // The user navigates to meeting-b…
        useMeetingStore.setState({ currentMeeting: makeMeeting('meeting-b') });

        // …and starts their own turn there (through the public store API).
        useMeetingStore.getState().executeTurnStreaming(PARTICIPANT_ID);
        await waitFor(() =>
            expect(useMeetingStore.getState().streamingMessage?.content).toBe('on b')
        );

        // meeting-a's stream resumes and must abandon silently.
        gateA.resolve();
        await runA;

        const store = useMeetingStore.getState();
        expect(store.currentMeeting?.id).toBe('meeting-b');
        // meeting-b's turn artifacts survive the abandoned stream.
        expect(store.streamingMessage?.content).toBe('on b');
        expect(store.activeTurnParticipantId).toBe(PARTICIPANT_ID);
    });

    it('navigation during the done-refetch barrier never swaps in the old meeting', async () => {
        const refetch = deferred();
        mocks.api.streamTurn.mockImplementation(async function* () {
            yield { type: 'text', content: 'partial answer' };
            yield { type: 'done', message_id: 'm-1' };
        });
        mocks.api.getMeeting.mockReturnValue(refetch.promise);

        useMeetingStore.setState({ currentMeeting: makeMeeting('meeting-a') });
        const run = useMeetingStore.getState().executeTurnStreaming(PARTICIPANT_ID);

        await waitFor(() => expect(mocks.api.getMeeting).toHaveBeenCalledWith('meeting-a'));

        useMeetingStore.setState({ currentMeeting: makeMeeting('meeting-b') });
        refetch.resolve(makeMeeting('meeting-a'));
        await run;

        const store = useMeetingStore.getState();
        expect(store.currentMeeting?.id).toBe('meeting-b');
        expect(store.streamingMessage).toBeNull();
    });
});

describe('late context stats', () => {
    it('stats for a stale meeting do not replace the current stats', async () => {
        const statsA = deferred();
        mocks.api.getContextStats
            .mockReturnValueOnce(statsA.promise)
            .mockReturnValueOnce(Promise.resolve({ used_tokens: 22 }));

        useMeetingStore.setState({
            currentMeeting: makeMeeting('meeting-a'),
            contextStats: { used_tokens: 22 },
        });

        const fetchPromise = useMeetingStore.getState().fetchContextStats();

        useMeetingStore.setState({ currentMeeting: makeMeeting('meeting-b') });
        statsA.resolve({ used_tokens: 11 });
        await fetchPromise;

        expect(useMeetingStore.getState().contextStats).toEqual({ used_tokens: 22 });
    });
});
