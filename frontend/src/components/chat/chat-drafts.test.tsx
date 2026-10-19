// @vitest-environment happy-dom
/**
 * Regression: the composer must behave like an owned draft (spec-02 C3).
 *
 * Evidence: handleSendMessage ALWAYS cleared the input, even when the send
 * failed (rejections were swallowed by the store) — the user lost their typed
 * text on an error and never learned the message was not delivered. There was
 * also no in-flight guard, so a double Enter or rapid re-click sent the same
 * message twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    api: {
        sendUserMessage: vi.fn(),
        getMeeting: vi.fn(),
        getDisagreements: vi.fn(),
        getConsensus: vi.fn(),
        getContextStats: vi.fn(),
        streamTurn: vi.fn(),
        executeTurn: vi.fn(),
    },
}));

vi.mock('@/lib/api', () => ({
    api: mocks.api,
    default: mocks.api,
}));

import { useMeetingStore } from '@/stores/meetingStore';
import { ChatArea } from '@/components/chat/ChatArea';

const MEETING_ID = 'meeting-1';

function deferred<T = unknown>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => (resolve = res));
    return { promise, resolve };
}

function currentMeetingFixture() {
    return {
        id: MEETING_ID,
        name: 'Policy Council',
        status: 'active',
        participants: [{ id: 'p-1', name: 'The Analyst', color: '#3b82f6', provider_config: { provider: 'ollama', model: 'llama3', temperature: 0.7 } }],
        messages: [],
        total_cost: 0,
    } as unknown as Parameters<typeof useMeetingStore.setState>[0]['currentMeeting'];
}

function resetStore() {
    useMeetingStore.setState({
        currentMeeting: currentMeetingFixture(),
        error: null,
        activeTurnParticipantId: null,
        activeTurnOperation: null,
        streamingMessage: null,
        loadOperation: null,
        turnOperation: null,
        contextStats: null,
    });
}

function renderComposer() {
    render(<ChatArea />);
    return screen.getByPlaceholderText('Type your message...') as HTMLInputElement;
}

function sendMessage(input: HTMLInputElement) {
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
}

beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
});

describe('composer drafts', () => {
    it('clears the input only after the send is confirmed', async () => {
        mocks.api.sendUserMessage.mockResolvedValue({
            id: 'msg-1',
            sender_type: 'user',
            sender_name: 'You',
            content: 'hello',
        });
        const input = renderComposer();

        fireEvent.change(input, { target: { value: 'hello' } });
        sendMessage(input);

        await waitFor(() => expect(input.value).toBe(''));
        // The confirmed message is visible in the transcript.
        expect(await screen.findByText('hello')).toBeInTheDocument();
        expect(mocks.api.sendUserMessage).toHaveBeenCalledWith(MEETING_ID, 'hello');
    });

    it('keeps the draft and shows the banner when the send fails', async () => {
        mocks.api.sendUserMessage.mockRejectedValue(
            new Error('Meeting is voting; messages can only be sent to an active meeting')
        );
        const input = renderComposer();

        fireEvent.change(input, { target: { value: 'hello' } });
        sendMessage(input);

        await waitFor(() =>
            expect(
                screen.getByText(/Meeting is voting; messages can only be sent/i)
            ).toBeInTheDocument()
        );
        expect(input.value).toBe('hello');

        // The failed send released the in-flight guard; a resend is possible.
        mocks.api.sendUserMessage.mockResolvedValueOnce({
            id: 'msg-2',
            sender_type: 'user',
            sender_name: 'You',
            content: 'hello',
        });
        mocks.api.sendUserMessage.mockClear();
        sendMessage(input);
        await waitFor(() => expect(mocks.api.sendUserMessage).toHaveBeenCalledTimes(1));
    });

    it('typing during an in-flight send is never wiped by the completion', async () => {
        const send = deferred();
        mocks.api.sendUserMessage.mockReturnValue(send.promise);
        const input = renderComposer();

        fireEvent.change(input, { target: { value: 'hello' } });
        sendMessage(input);

        // The user keeps typing while the send is in flight.
        fireEvent.change(input, { target: { value: 'hello world' } });
        send.resolve({
            id: 'msg-1',
            sender_type: 'user',
            sender_name: 'You',
            content: 'hello',
        });

        await waitFor(() => expect(input.value).toBe('hello world'));
    });

    it('blocks duplicate sends of an unchanged draft while in flight', async () => {
        const send = deferred();
        mocks.api.sendUserMessage.mockReturnValue(send.promise);
        const input = renderComposer();

        fireEvent.change(input, { target: { value: 'hello' } });
        sendMessage(input);
        sendMessage(input);

        send.resolve({
            id: 'msg-1',
            sender_type: 'user',
            sender_name: 'You',
            content: 'hello',
        });

        await waitFor(() => expect(input.value).toBe(''));
        expect(mocks.api.sendUserMessage).toHaveBeenCalledTimes(1);
    });

    it('allows sending edited content while a previous send is in flight', async () => {
        const first = deferred();
        mocks.api.sendUserMessage
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce({
                id: 'msg-2',
                sender_type: 'user',
                sender_name: 'You',
                content: 'hello world',
            });
        const input = renderComposer();

        fireEvent.change(input, { target: { value: 'hello' } });
        sendMessage(input);
        fireEvent.change(input, { target: { value: 'hello world' } });
        sendMessage(input);

        first.resolve({
            id: 'msg-1',
            sender_type: 'user',
            sender_name: 'You',
            content: 'hello',
        });

        await waitFor(() =>
            expect(mocks.api.sendUserMessage).toHaveBeenCalledWith(MEETING_ID, 'hello world')
        );
    });
});
