/**
 * Meeting room ownership and draft contracts (spec-10).
 *
 * The room reads canonical feature queries and writes messages through the
 * canonical mutation. The composer keeps failed drafts and clears only its
 * own confirmed revision.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Providers, getQueryClient } from '@/app/providers';
import { MeetingRoom, meetingKeys } from '@/features/meetings';
import { LiveMeetingsRuntimeProvider } from '@/features/meetings/runtime/live';
import { makeSseResponse, sseFrame } from '../fixtures/sse';

const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222';

interface Call {
    url: string;
    method: string;
    body?: unknown;
}

function meetingWire() {
    return {
        id: MEETING_ID,
        user_id: null,
        name: 'Product review',
        agenda: 'Decide the launch date',
        status: 'active',
        total_cost: 0,
        created_at: '2026-10-20T10:00:00.000000Z',
        participants: [
            {
                id: PARTICIPANT_ID,
                meeting_id: MEETING_ID,
                name: 'The Investor',
                role: 'investor',
                system_prompt: 'Be skeptical.',
                provider_config: {
                    provider: 'ollama',
                    model: 'llama3.2',
                    temperature: 0.7,
                    max_tokens: 2048,
                },
                color: '#f59e0b',
                persona_id: null,
                stack_ids: [],
                created_at: '2026-10-20T10:00:00.000000Z',
            },
        ],
        messages: [],
    };
}

function messageWire(content: string, overrides: Record<string, unknown> = {}) {
    return {
        id: '33333333-3333-4333-8333-333333333333',
        meeting_id: MEETING_ID,
        sender_type: 'user',
        sender_id: null,
        sender_name: 'You',
        content,
        citations: [],
        tool_artifacts: null,
        thinking_content: null,
        estimated_cost: 0,
        created_at: '2026-10-20T10:01:00.000000Z',
        request_key: null,
        ...overrides,
    };
}

function installRouter(
    overrides: Record<string, () => Response | Promise<Response>> = {}
) {
    const calls: Call[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: unknown, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method ?? 'GET';
            let body: unknown;
            if (typeof init?.body === 'string') {
                body = JSON.parse(init.body);
            }
            calls.push({ url, method, body });

            for (const [suffix, respond] of Object.entries(overrides)) {
                if (url.endsWith(suffix)) return respond();
            }
            if (url.endsWith(`/meetings/${MEETING_ID}`)) {
                return json(200, meetingWire());
            }
            if (url.includes('/disagreements')) return json(200, []);
            if (url.includes('/consensus')) return json(200, []);
            if (url.includes('/context-stats')) {
                return json(200, {
                    current_tokens: 100,
                    max_tokens: 4000,
                    usage_percent: 2.5,
                    message_count: 0,
                    participant_count: 1,
                });
            }
            if (url.endsWith(`/meetings/${MEETING_ID}/closing`)) {
                return json(200, {
                    meeting_id: MEETING_ID,
                    meeting_status: 'active',
                    archived: false,
                    closing_id: null,
                    request_key: null,
                    mode: null,
                    stage: null,
                    failed_from_stage: null,
                    votes: [],
                    summary: null,
                    summary_message_id: null,
                    error: null,
                    retryable: false,
                    abortable: false,
                    created_at: null,
                    updated_at: null,
                    completed_at: null,
                });
            }
            if (url.includes('/turns')) return json(200, []);
            throw new Error(`Unexpected request: ${method} ${url}`);
        })
    );
    return calls;
}

function json(status: number, body: unknown): Response {
    return {
        ok: status < 400,
        status,
        json: async () => body,
    } as unknown as Response;
}

function renderRoom(
    props: {
        activeTab?: string;
        onTabChange?: (tab: string) => void;
    } = {}
) {
    return render(
        <Providers>
            <LiveMeetingsRuntimeProvider>
                <MeetingRoom meetingId={MEETING_ID} {...props} />
            </LiveMeetingsRuntimeProvider>
        </Providers>
    );
}

describe('MeetingRoom', () => {
    beforeEach(() => {
        getQueryClient().clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('renders the canonical meeting and participant roster', async () => {
        installRouter();
        renderRoom();
        expect(await screen.findByText('Product review')).toBeInTheDocument();
        expect(screen.getByText('Decide the launch date')).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /Investor/ })).toBeInTheDocument();
    });

    it('sends a user message through the canonical mutation and appends it', async () => {
        const calls = installRouter({
            '/message': () => json(200, messageWire('Ship on Friday')),
        });
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.change(input, { target: { value: 'Ship on Friday' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

        expect(await screen.findByText('Ship on Friday')).toBeInTheDocument();
        const send = calls.filter((call) => call.url.endsWith('/message'));
        expect(send).toHaveLength(1);
        expect(send[0]!.method).toBe('POST');
        expect(send[0]!.body).toMatchObject({
            content: 'Ship on Friday',
            request_key: expect.any(String),
        });
        expect((send[0]!.body as { request_key: string }).request_key.length).toBeGreaterThan(0);
        expect(input).toHaveValue('');
    });

    it('replaces a terminal projection with the canonical message once', async () => {
        const canonical = {
            ...messageWire('Canonical answer'),
            id: '44444444-4444-4444-8444-444444444444',
            sender_type: 'ai',
            sender_id: PARTICIPANT_ID,
            sender_name: 'The Investor',
        };
        let meetingReads = 0;
        installRouter({
            '/events?after=0': () =>
                makeSseResponse([
                    sseFrame(
                        JSON.stringify({
                            meeting_id: MEETING_ID,
                            operation_id: '55555555-5555-4555-8555-555555555555',
                            event_id: 'event-1',
                            sequence: 1,
                            type: 'text',
                            content: 'Partial answer',
                        })
                    ),
                    sseFrame(
                        JSON.stringify({
                            meeting_id: MEETING_ID,
                            operation_id: '55555555-5555-4555-8555-555555555555',
                            event_id: 'event-2',
                            sequence: 2,
                            type: 'done',
                            message_id: canonical.id,
                        })
                    ),
                ]),
            [`/meetings/${MEETING_ID}`]: () => {
                meetingReads += 1;
                return json(200, {
                    ...meetingWire(),
                    messages: meetingReads === 1 ? [] : [canonical],
                });
            },
            '/turns?limit=100': () =>
                json(200, [
                    {
                        operation_id: '55555555-5555-4555-8555-555555555555',
                        meeting_id: MEETING_ID,
                        participant_id: PARTICIPANT_ID,
                        request_key: 'turn-request-1',
                        status: 'executing',
                        admission: 1,
                        queue_position: null,
                        created_at: '2026-10-20T10:00:00.000000Z',
                        started_at: '2026-10-20T10:00:01.000000Z',
                        completed_at: null,
                        final_message_id: null,
                        cancel_requested: false,
                        error: null,
                        effective_generation: null,
                    },
                ]),
        });
        renderRoom();

        expect(await screen.findByText('Canonical answer')).toBeInTheDocument();
        expect(screen.queryByText('Partial answer')).not.toBeInTheDocument();
        expect(screen.getAllByText('Canonical answer')).toHaveLength(1);
    });

    it('keeps the draft when the save fails', async () => {
        installRouter({
            '/message': () => json(500, { detail: 'database unreachable' }),
        });
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.change(input, { target: { value: 'Do not lose me' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

        expect(
            await screen.findByText(
                "We couldn't confirm whether this message was saved. Your draft is still here; retrying is safe."
            )
        ).toBeInTheDocument();
        expect(input).toHaveValue('Do not lose me');
    });

    it('does not send while an input method is composing', async () => {
        const calls = installRouter({
            '/message': () => json(200, messageWire('Composed')),
        });
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: 'Composed' } });
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(calls.filter((call) => call.url.endsWith('/message'))).toHaveLength(0);
        expect(input).toHaveValue('Composed');

        fireEvent.compositionEnd(input);
        fireEvent.keyUp(input, { key: 'Enter' });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(input).toHaveValue(''));
        expect(calls.filter((call) => call.url.endsWith('/message'))).toHaveLength(1);
    });

    it('ignores the Enter that confirms an IME candidate but sends the next one', async () => {
        const calls = installRouter({
            '/message': () => json(200, messageWire('Candidate')),
        });
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: 'Candidate' } });
        fireEvent.compositionEnd(input);

        // Safari can order compositionend before the confirming keydown.
        fireEvent.keyDown(input, { key: 'Enter' });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(calls.filter((call) => call.url.endsWith('/message'))).toHaveLength(0);
        expect(input).toHaveValue('Candidate');

        fireEvent.keyUp(input, { key: 'Enter' });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(input).toHaveValue(''));
        expect(calls.filter((call) => call.url.endsWith('/message'))).toHaveLength(1);
    });

    it('keeps Shift+Enter as a newline and does not send', async () => {
        const calls = installRouter();
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.change(input, { target: { value: 'First line' } });
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(calls.filter((call) => call.url.endsWith('/message'))).toHaveLength(0);
        expect(input).toHaveValue('First line');
    });

    it('reuses one request key after a lost response and saves once', async () => {
        let posts = 0;
        const calls = installRouter({
            '/message': () => {
                posts += 1;
                if (posts === 1) throw new TypeError('Failed to fetch');
                return json(200, messageWire('Retry me', { request_key: 'response-key' }));
            },
        });
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.change(input, { target: { value: 'Retry me' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

        expect(
            await screen.findByText(
                "We couldn't confirm whether this message was saved. Your draft is still here; retrying is safe."
            )
        ).toBeInTheDocument();
        expect(input).toHaveValue('Retry me');

        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
        await waitFor(() => expect(input).toHaveValue(''));

        const sends = calls.filter((call) => call.url.endsWith('/message'));
        expect(sends).toHaveLength(2);
        const keys = sends.map(
            (call) => (call.body as { request_key: string }).request_key
        );
        expect(keys[0]).toBe(keys[1]);
        expect(screen.getAllByText('Retry me')).toHaveLength(1);
    });

    it('uses a new request key after a deterministic rejection', async () => {
        let posts = 0;
        const calls = installRouter({
            '/message': () => {
                posts += 1;
                if (posts === 1) return json(422, { detail: 'Invalid message' });
                return json(200, messageWire('Corrected'));
            },
        });
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.change(input, { target: { value: 'Corrected' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

        expect(
            await screen.findByText("This message wasn't accepted. Your draft is still here.")
        ).toBeInTheDocument();
        expect(input).toHaveValue('Corrected');

        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
        await waitFor(() => expect(input).toHaveValue(''));

        const sends = calls.filter((call) => call.url.endsWith('/message'));
        const keys = sends.map(
            (call) => (call.body as { request_key: string }).request_key
        );
        expect(keys).toHaveLength(2);
        expect(keys[0]).not.toBe(keys[1]);
    });

    it('keeps one cached message when a GET wins the race with the POST response', async () => {
        let resolvePost: ((response: Response) => void) | null = null;
        let posts = 0;
        const calls = installRouter({
            '/message': () => {
                posts += 1;
                return new Promise<Response>((resolve) => {
                    resolvePost = resolve;
                });
            },
        });
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.change(input, { target: { value: 'Saved once' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
        await waitFor(() => expect(posts).toBe(1));

        const requestKey = (
            calls.find((call) => call.url.endsWith('/message'))!.body as {
                request_key: string;
            }
        ).request_key;
        const saved = messageWire('Saved once', {
            id: '66666666-6666-4666-8666-666666666666',
            request_key: requestKey,
        });

        act(() => {
            getQueryClient().setQueryData(meetingKeys.detail(MEETING_ID), {
                ...meetingWire(),
                messages: [saved],
            });
        });

        await waitFor(() => expect(input).toHaveValue(''));
        expect(screen.getAllByText('Saved once')).toHaveLength(1);

        await act(async () => {
            resolvePost?.(json(200, saved));
        });

        expect(screen.getAllByText('Saved once')).toHaveLength(1);
    });

    it('gives a deliberately identical new message a new identity', async () => {
        let posts = 0;
        const calls = installRouter({
            '/message': () => {
                posts += 1;
                return json(
                    200,
                    messageWire('Same words', {
                        id: `message-${posts}`,
                        request_key: `response-${posts}`,
                    })
                );
            },
        });
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.change(input, { target: { value: 'Same words' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
        await waitFor(() => expect(input).toHaveValue(''));

        fireEvent.change(input, { target: { value: 'Same words' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
        await waitFor(() =>
            expect(screen.getAllByText('Same words')).toHaveLength(2)
        );

        const sends = calls.filter((call) => call.url.endsWith('/message'));
        const keys = sends.map(
            (call) => (call.body as { request_key: string }).request_key
        );
        expect(keys).toHaveLength(2);
        expect(keys[0]).not.toBe(keys[1]);
    });

    it('keeps the draft and names access loss without claiming a save', async () => {
        installRouter({
            '/message': () => json(403, { detail: 'Forbidden' }),
        });
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.change(input, { target: { value: 'Needs access' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

        expect(
            await screen.findByText(
                "Your session can't send this message right now. Your draft is still here."
            )
        ).toBeInTheDocument();
        expect(input).toHaveValue('Needs access');
    });

    it('keeps the composer draft across room tab navigation', async () => {
        installRouter();
        renderRoom();

        const input = await screen.findByPlaceholderText('Type your message...');
        fireEvent.change(input, { target: { value: 'Do not lose me' } });

        fireEvent.mouseDown(screen.getByRole('tab', { name: /Personas/ }));
        expect(await screen.findByText('Knowledge assignments')).toBeInTheDocument();
        expect(input).toHaveValue('Do not lose me');

        fireEvent.mouseDown(screen.getByRole('tab', { name: /Chat/ }));
        expect(input).toHaveValue('Do not lose me');
    });

    it('keeps ended meetings read-only', async () => {
        installRouter({
            [`/meetings/${MEETING_ID}`]: () => {
                const meeting = meetingWire();
                return json(200, { ...meeting, status: 'ended' });
            },
        });
        renderRoom();

        await screen.findByText('Product review');
        fireEvent.click(screen.getByRole('button', { name: 'Details' }));
        expect(within(screen.getByRole('dialog')).getByText('ended')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Type your message...')).not.toBeInTheDocument();
    });

    it('does not open an empty record or leave a record tab stranded', async () => {
        installRouter();
        const onTabChange = vi.fn();
        renderRoom({ activeTab: 'consensus', onTabChange });

        await screen.findByText('Product review');
        await waitFor(() => expect(onTabChange).toHaveBeenCalledWith('chat'));

        expect(document.querySelector('#room-record')).toBeNull();
        expect(screen.getByRole('button', { name: 'Meeting record' })).toBeDisabled();
        expect(screen.getByTestId('record-disabled-trigger')).toBeInTheDocument();
    });

    it('does not move the message viewport when the reader is away from the bottom', async () => {
        installRouter();
        const scrollIntoView = vi
            .spyOn(HTMLElement.prototype, 'scrollIntoView')
            .mockImplementation(() => {});
        renderRoom();
        await screen.findByText('Product review');

        const viewport = document.querySelector(
            '[data-slot="scroll-area-viewport"]'
        ) as HTMLElement;
        Object.defineProperty(viewport, 'scrollHeight', {
            configurable: true,
            value: 1000,
        });
        Object.defineProperty(viewport, 'clientHeight', {
            configurable: true,
            value: 300,
        });
        Object.defineProperty(viewport, 'scrollTop', {
            configurable: true,
            value: 0,
            writable: true,
        });
        fireEvent.scroll(viewport);
        scrollIntoView.mockClear();

        getQueryClient().setQueryData(meetingKeys.detail(MEETING_ID), {
            ...meetingWire(),
            messages: [messageWire('Earlier message')],
        });

        expect(await screen.findByText('Earlier message')).toBeInTheDocument();
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(viewport.scrollTop).toBe(0);
    });

    it('pins the message viewport without scrolling the page', async () => {
        installRouter();
        const scrollIntoView = vi
            .spyOn(HTMLElement.prototype, 'scrollIntoView')
            .mockImplementation(() => {});
        renderRoom();
        await screen.findByText('Product review');

        const viewport = document.querySelector(
            '[data-slot="scroll-area-viewport"]'
        ) as HTMLElement;
        Object.defineProperty(viewport, 'scrollHeight', {
            configurable: true,
            value: 1000,
        });
        Object.defineProperty(viewport, 'clientHeight', {
            configurable: true,
            value: 300,
        });
        Object.defineProperty(viewport, 'scrollTop', {
            configurable: true,
            value: 700,
            writable: true,
        });
        fireEvent.scroll(viewport);
        scrollIntoView.mockClear();

        getQueryClient().setQueryData(meetingKeys.detail(MEETING_ID), {
            ...meetingWire(),
            messages: [messageWire('Earlier message')],
        });

        await waitFor(() => expect(viewport.scrollTop).toBe(1000));
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('keeps archived meetings read-only', async () => {
        installRouter({
            [`/meetings/${MEETING_ID}`]: () => {
                const meeting = meetingWire();
                return json(200, { ...meeting, status: 'archived' });
            },
        });
        renderRoom();

        await screen.findByText('Product review');
        fireEvent.click(screen.getByRole('button', { name: 'Details' }));
        expect(within(screen.getByRole('dialog')).getByText('archived')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Type your message...')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Close meeting/i })).not.toBeInTheDocument();
    });

    it('keeps an interim summary separate from closing the meeting', async () => {
        let summarized = false;
        const transcript = messageWire('Opening remarks');
        const summary = {
            ...messageWire('Interim summary'),
            id: '44444444-4444-4444-8444-444444444444',
            sender_type: 'system',
            sender_name: 'System AI',
            content: 'Interim summary',
        };
        const calls = installRouter({
            '/settings/providers': () =>
                json(200, {
                    providers: [],
                    environment: {
                        is_production: false,
                        configured_providers: [],
                        default_provider: '',
                        default_models: {},
                    },
                    system_ai: {
                        provider: 'ollama',
                        model: 'llama3.2',
                        temperature: 0.5,
                        max_tokens: 2048,
                    },
                }),
            '/summary': () => {
                summarized = true;
                return json(200, summary);
            },
            [`/meetings/${MEETING_ID}`]: () =>
                json(200, {
                    ...meetingWire(),
                    messages: summarized ? [transcript, summary] : [transcript],
                }),
        });
        renderRoom();
        await screen.findByText('Product review');

        fireEvent.mouseDown(screen.getByRole('tab', { name: /Summary/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Generate summary/ }));

        expect(await screen.findByText('Interim summary')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
        expect(
            calls.filter(
                (call) => call.method === 'POST' && call.url.includes('/closing')
            )
        ).toHaveLength(0);
    });

    it('disables summary generation when the meeting closes while the panel is open', async () => {
        const transcript = messageWire('Opening remarks');
        const savedSummary = {
            ...messageWire('Interim summary'),
            id: '44444444-4444-4444-8444-444444444444',
            sender_type: 'system',
            sender_name: 'System AI',
            content: 'Interim summary',
        };
        installRouter({
            '/settings/providers': () =>
                json(200, {
                    providers: [],
                    environment: {
                        is_production: false,
                        configured_providers: [],
                        default_provider: '',
                        default_models: {},
                    },
                    system_ai: {
                        provider: 'ollama',
                        model: 'llama3.2',
                        temperature: 0.5,
                        max_tokens: 2048,
                    },
                }),
            [`/meetings/${MEETING_ID}`]: () =>
                json(200, {
                    ...meetingWire(),
                    messages: [transcript, savedSummary],
                }),
        });
        renderRoom();
        await screen.findByText('Product review');

        fireEvent.mouseDown(screen.getByRole('tab', { name: /Summary/ }));
        const generate = await screen.findByRole('button', {
            name: /Generate summary/,
        });
        expect(generate).toBeEnabled();

        act(() => {
            getQueryClient().setQueryData(meetingKeys.detail(MEETING_ID), {
                ...meetingWire(),
                status: 'ended',
                messages: [transcript, savedSummary],
            });
        });

        await waitFor(() => expect(generate).toBeDisabled());
        expect(
            screen.getByText(
                'This meeting is closed. Saved summaries remain readable, but new summaries cannot be generated.'
            )
        ).toBeInTheDocument();
        expect(screen.getByText('Interim summary')).toBeInTheDocument();
    });

    it('does not render fabricated private knowledge files', async () => {
        installRouter();
        renderRoom();
        await screen.findByText('Product review');
        fireEvent.mouseDown(screen.getByRole('tab', { name: /Personas/ }));

        expect(await screen.findByText('Knowledge assignments')).toBeInTheDocument();
        expect(screen.queryByText(/Q4_2025_Financial_Report/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Market_Analysis_2026/)).not.toBeInTheDocument();
        expect(screen.getByText('0 stacks')).toBeInTheDocument();
    });
});
