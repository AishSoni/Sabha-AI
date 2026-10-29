/**
 * Recorded read frontier (spec-17).
 *
 * The intent selects a checkpoint and operation locally; reads at that
 * checkpoint never expose the final answer. The terminal event first installs
 * the completed checkpoint's canonical bundle, then the shared projection
 * shows exactly one final message.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Providers } from '@/app/providers';
import { ReplayMeetingRoom } from '@/features/meetings/runtime/replay';
import { makeSseResponse, sseFrame } from '../fixtures/sse';

const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222';
const OPERATION_ID = '66666666-6666-4666-8666-666666666666';
const FINAL_ID = '77777777-7777-4777-8777-777777777777';
const FINAL_TEXT = 'The synthetic brief shows coverage of 1.8x.';

interface Call {
    url: URL;
    method: string;
}

function json(body: unknown, status = 200): Response {
    return {
        ok: status < 400,
        status,
        json: async () => body,
    } as unknown as Response;
}

function meeting(checkpoint: 'initial' | 'active' | 'completed') {
    return {
        id: MEETING_ID,
        user_id: null,
        name: 'Recorded credit review',
        agenda: 'Assess the synthetic issuer.',
        status: 'active',
        total_cost: 0,
        created_at: '2026-01-15T10:00:00Z',
        participants: [
            {
                id: PARTICIPANT_ID,
                meeting_id: MEETING_ID,
                name: 'The Credit Analyst',
                role: 'Credit Analyst',
                system_prompt: 'Recorded placeholder.',
                provider_config: { provider: 'recorded', model: 'recorded' },
                color: '#6366f1',
                persona_id: null,
                stack_ids: [],
                created_at: '2026-01-15T10:00:00Z',
            },
        ],
        messages:
            checkpoint === 'completed'
                ? [
                      {
                          id: FINAL_ID,
                          meeting_id: MEETING_ID,
                          sender_type: 'ai',
                          sender_id: PARTICIPANT_ID,
                          sender_name: 'The Credit Analyst',
                          content: FINAL_TEXT,
                          citations: [],
                          tool_artifacts: null,
                          thinking_content: null,
                          estimated_cost: 0,
                          created_at: '2026-01-15T10:00:20Z',
                      },
                  ]
                : [],
    };
}

function operation(status: 'executing' | 'completed') {
    return {
        operation_id: OPERATION_ID,
        meeting_id: MEETING_ID,
        participant_id: PARTICIPANT_ID,
        request_key: 'turn-1',
        status,
        admission: 1,
        queue_position: status === 'executing' ? 0 : null,
        created_at: '2026-01-15T10:00:05Z',
        started_at: '2026-01-15T10:00:05Z',
        completed_at: status === 'completed' ? '2026-01-15T10:00:20Z' : null,
        final_message_id: status === 'completed' ? FINAL_ID : null,
        cancel_requested: false,
        error: null,
        effective_generation: null,
    };
}

function session() {
    return {
        run_id: 'run-1',
        package_id: 'placeholder-analyst',
        package_version: '1',
        content_sha256: 'a'.repeat(64),
        meeting_id: MEETING_ID,
        label: 'Recorded placeholder',
        provenance: { synthetic: true },
        capabilities: {
            meetingRead: true,
            turnObservation: true,
            disagreements: true,
            consensus: true,
            contextStats: false,
            createMeeting: false,
            sendMessage: false,
            submitTurn: false,
            cancelTurn: false,
            summary: false,
            documents: false,
            closing: false,
        },
        checkpoint_id: 'initial',
        initial_checkpoint: 'initial',
        checkpoints: ['initial', 'active', 'completed'],
        intents: [
            {
                intent_id: 'start-credit-analyst',
                kind: 'start_participant',
                checkpoint: 'active',
                participant_id: PARTICIPANT_ID,
                operation_id: OPERATION_ID,
                tape_id: 'tape-1',
                closing_tape_id: null,
                label: 'Ask the Credit Analyst',
            },
        ],
        tapes: [
            {
                tape_id: 'tape-1',
                operation_id: OPERATION_ID,
                participant_id: PARTICIPANT_ID,
                initial_checkpoint: 'active',
                completed_checkpoint: 'completed',
            },
        ],
        assets: [],
        claims: [],
        preview: { available: false, asset_ids: [] },
        retired: false,
    };
}

function event(sequence: number, overrides: Record<string, unknown>): string {
    return sseFrame(
        JSON.stringify({
            meeting_id: MEETING_ID,
            operation_id: OPERATION_ID,
            event_id: `event-${sequence}`,
            sequence,
            ...overrides,
        })
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('recorded read frontier', () => {
    it('selects the intent checkpoint, then installs the completed checkpoint before settling', async () => {
        const calls: Call[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: unknown, init?: RequestInit) => {
                const url = new URL(String(input));
                calls.push({ url, method: init?.method ?? 'GET' });
                const checkpoint = url.searchParams.get('checkpoint') ?? 'initial';

                if (url.pathname.endsWith('/api/replay/session')) {
                    return json(session());
                }
                if (url.pathname.endsWith(`/meetings/${MEETING_ID}`)) {
                    return json(
                        meeting(
                            checkpoint === 'completed'
                                ? 'completed'
                                : checkpoint === 'active'
                                  ? 'active'
                                  : 'initial'
                        )
                    );
                }
                if (url.pathname.endsWith('/disagreements')) return json([]);
                if (url.pathname.endsWith('/consensus')) return json([]);
                if (url.pathname.endsWith('/turns')) {
                    return json(
                        checkpoint === 'completed'
                            ? [operation('completed')]
                            : checkpoint === 'active'
                              ? [operation('executing')]
                              : []
                    );
                }
                if (url.pathname.endsWith(`/turns/${OPERATION_ID}/events`)) {
                    return makeSseResponse([
                        event(1, { type: 'text', content: 'Synthetic ' }),
                        event(2, { type: 'text', content: 'answer.' }),
                        event(3, { type: 'done', message_id: FINAL_ID }),
                    ]);
                }
                throw new Error(`Unexpected replay request: ${url}`);
            })
        );

        render(
            <Providers>
                <ReplayMeetingRoom meetingId={MEETING_ID} />
            </Providers>
        );

        expect(await screen.findByText('Recorded credit review')).toBeInTheDocument();
        fireEvent.click(
            await screen.findByRole('button', { name: /Ask the Credit Analyst/ })
        );

        await waitFor(() =>
            expect(
                calls.some(
                    (call) =>
                        call.url.pathname.endsWith(`/turns/${OPERATION_ID}/events`) &&
                        call.url.searchParams.get('checkpoint') === 'active'
                )
            ).toBe(true)
        );

        expect(await screen.findByText(FINAL_TEXT)).toBeInTheDocument();
        expect(screen.getAllByText(FINAL_TEXT)).toHaveLength(1);
        expect(
            calls.some(
                (call) =>
                    call.url.pathname.endsWith(`/meetings/${MEETING_ID}`) &&
                    call.url.searchParams.get('checkpoint') === 'completed'
            )
        ).toBe(true);
        expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
    });
});
