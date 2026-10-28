/**
 * Room-level closing integration (spec-15).
 *
 * The real meeting room, live runtime, feature hooks, and closing panel drive
 * one deterministic HTTP contract. This is deliberately not a standalone
 * panel render: the close entry, room admission, progress observation, and
 * canonical completion refresh all have to meet here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Providers, getQueryClient } from '@/app/providers';
import { MeetingRoom } from '@/features/meetings';
import { LiveMeetingsRuntimeProvider } from '@/features/meetings/runtime/live';

const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222';
const CLOSING_ID = '44444444-4444-4444-8444-444444444444';
const SUMMARY = '📋 **MEETING ENDED**\nWe agreed to ship on Friday.';

interface Call {
    url: string;
    method: string;
    body?: unknown;
}

interface ClosingState {
    status: 'active' | 'voting' | 'ended' | 'archived';
    stage: 'draining' | 'voting' | 'summarizing' | 'completed' | 'failed' | null;
    closingId: string | null;
    requestKey: string | null;
    summary: string | null;
}

function meetingWire(status: ClosingState['status']) {
    return {
        id: MEETING_ID,
        user_id: null,
        name: 'Product review',
        agenda: 'Decide the launch date',
        status,
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

function closingWire(state: ClosingState) {
    return {
        meeting_id: MEETING_ID,
        meeting_status: state.status,
        archived: false,
        closing_id: state.closingId,
        request_key: state.requestKey,
        mode: state.stage ? 'vote' : null,
        stage: state.stage,
        failed_from_stage: null,
        votes: [],
        summary: state.summary,
        summary_message_id: state.summary ? '55555555-5555-4555-8555-555555555555' : null,
        error: null,
        retryable: false,
        abortable: state.stage === 'draining',
        created_at: '2026-10-22T09:59:00Z',
        updated_at: '2026-10-22T10:00:00Z',
        completed_at: state.stage === 'completed' ? '2026-10-22T10:05:00Z' : null,
    };
}

function json(status: number, body: unknown): Response {
    return {
        ok: status < 400,
        status,
        json: async () => body,
    } as unknown as Response;
}

function installClosingRouter() {
    const calls: Call[] = [];
    const state: ClosingState = {
        status: 'active',
        stage: null,
        closingId: null,
        requestKey: null,
        summary: null,
    };

    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: unknown, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method ?? 'GET';
            const body =
                typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
            calls.push({ url, method, body });

            if (url.endsWith(`/meetings/${MEETING_ID}/closing`)) {
                if (method === 'POST') {
                    state.status = 'voting';
                    state.stage = 'draining';
                    state.closingId = CLOSING_ID;
                    state.requestKey = body.request_key;
                    return json(202, {
                        meeting_id: MEETING_ID,
                        closing_id: CLOSING_ID,
                        stage: 'draining',
                        meeting_status: 'voting',
                    });
                }
                return json(200, closingWire(state));
            }
            if (url.endsWith(`/meetings/${MEETING_ID}`)) {
                return json(200, meetingWire(state.status));
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
            if (url.includes('/turns')) return json(200, []);
            throw new Error(`Unexpected request: ${method} ${url}`);
        })
    );

    return {
        calls,
        complete() {
            state.status = 'ended';
            state.stage = 'completed';
            state.summary = SUMMARY;
        },
    };
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

describe('MeetingRoom closing workflow', () => {
    beforeEach(() => {
        getQueryClient().clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('starts the real close, observes progress, and reconciles completion once', async () => {
        const router = installClosingRouter();
        renderRoom();

        const entry = await screen.findByRole('button', { name: /Close meeting/i });
        fireEvent.click(entry);

        expect(await screen.findByRole('heading', { name: 'Close Meeting' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Vote to End/i }));
        fireEvent.click(screen.getByRole('button', { name: /Start Vote/i }));

        await waitFor(() => {
            expect(
                router.calls.filter(
                    (call) =>
                        call.method === 'POST' &&
                        call.url.endsWith(`/meetings/${MEETING_ID}/closing`)
                )
            ).toHaveLength(1);
        });

        const request = router.calls.find(
            (call) =>
                call.method === 'POST' &&
                call.url.endsWith(`/meetings/${MEETING_ID}/closing`)
        );
        expect(request?.body).toMatchObject({ mode: 'vote' });
        expect(
            String((request?.body as { request_key?: string } | undefined)?.request_key)
        ).toMatch(/[0-9a-f-]{20,}/);
        expect(request?.body).not.toHaveProperty('summary_settings.api_key');

        expect(await screen.findByText('Finishing queued work')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Type your message...')).not.toBeInTheDocument();

        router.complete();

        expect(await screen.findByText('Meeting ended', {}, { timeout: 4000 })).toBeInTheDocument();
        expect(screen.getByText('This meeting is read-only.')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Type your message...')).not.toBeInTheDocument();

        const panel = document.getElementById('closing-panel');
        expect(panel).not.toBeNull();
        expect(within(panel as HTMLElement).getAllByText(/ship on Friday/)).toHaveLength(1);

        const meetingReads = router.calls.filter(
            (call) =>
                call.method === 'GET' &&
                call.url.endsWith(`/meetings/${MEETING_ID}`)
        );
        expect(meetingReads.length).toBeGreaterThanOrEqual(2);
        expect(
            router.calls.filter((call) => call.url.includes('/closing/abort'))
        ).toHaveLength(0);
    }, 10_000);
});
