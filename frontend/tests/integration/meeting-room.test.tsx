/**
 * Meeting room ownership and draft contracts (spec-10).
 *
 * The room reads canonical feature queries and writes messages through the
 * canonical mutation. The composer keeps failed drafts and clears only its
 * own confirmed revision.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Providers, getQueryClient } from '@/app/providers';
import { MeetingRoom, meetingKeys } from '@/features/meetings';
import { LiveMeetingsRuntimeProvider } from '@/features/meetings/runtime/live';

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

function messageWire(content: string) {
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
    };
}

function installRouter(overrides: Record<string, () => Response> = {}) {
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

function renderRoom() {
    return render(
        <Providers>
            <LiveMeetingsRuntimeProvider>
                <MeetingRoom meetingId={MEETING_ID} />
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
        expect(screen.getByRole('button', { name: /Investor/ })).toBeInTheDocument();
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
        expect(send[0]!.body).toEqual({ content: 'Ship on Friday' });
        expect(input).toHaveValue('');
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
            await screen.findByText('The message was not saved. Your draft is still here; try again.')
        ).toBeInTheDocument();
        expect(input).toHaveValue('Do not lose me');
    });

    it('renders a read-only notice for ended meetings', async () => {
        installRouter({
            [`/meetings/${MEETING_ID}`]: () => {
                const meeting = meetingWire();
                return json(200, { ...meeting, status: 'ended' });
            },
        });
        renderRoom();

        expect(await screen.findByText('This meeting is read-only.')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Type your message...')).not.toBeInTheDocument();
    });

    it('does not steal scroll when the reader is away from the bottom', async () => {
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
    });

    it('scrolls without animation when reduced motion is requested', async () => {
        installRouter();
        const scrollIntoView = vi
            .spyOn(HTMLElement.prototype, 'scrollIntoView')
            .mockImplementation(() => {});
        vi.stubGlobal(
            'matchMedia',
            vi.fn().mockReturnValue({ matches: true })
        );
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

        await waitFor(() =>
            expect(scrollIntoView).toHaveBeenCalledWith({
                behavior: 'auto',
                block: 'end',
            })
        );
    });

    it('renders a read-only notice for archived meetings', async () => {
        installRouter({
            [`/meetings/${MEETING_ID}`]: () => {
                const meeting = meetingWire();
                return json(200, { ...meeting, status: 'archived' });
            },
        });
        renderRoom();

        expect(await screen.findByText('This meeting is read-only.')).toBeInTheDocument();
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

    it('does not render fabricated private knowledge files', async () => {
        installRouter();
        renderRoom();
        await screen.findByText('Product review');
        fireEvent.mouseDown(screen.getByRole('tab', { name: /Roster/ }));

        expect(await screen.findByText('Private Knowledge Stack')).toBeInTheDocument();
        expect(screen.queryByText(/Q4_2025_Financial_Report/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Market_Analysis_2026/)).not.toBeInTheDocument();
        expect(screen.getByText('0 stacks')).toBeInTheDocument();
    });
});
