/**
 * Recorded replay runtime isolation (spec-14).
 *
 * The replay route composes the same MeetRoom but only against `/api/replay`.
 * These tests prove the observable contracts the runtime split exists for:
 * no live endpoint or credential header, no vault hydration, no live cooldown
 * mutation, epoch restart replacing cache identity, and colliding meeting ids
 * staying separate from the live screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Providers } from '@/app/providers';
import { MeetingRoom } from '@/features/meetings';
import { LiveMeetingsRuntimeProvider } from '@/features/meetings/runtime/live';
import { ReplayMeetingRoom } from '@/features/meetings/runtime/replay';
import { useSettingsStore } from '@/features/settings';
import { useRateLimitStore } from '@/stores/rateLimitStore';

const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222';
const API = 'http://localhost:8000/api';

interface Call {
    url: string;
    method: string;
    headers: Headers;
    body?: unknown;
}

function json(status: number, body: unknown): Response {
    return {
        ok: status < 400,
        status,
        json: async () => body,
    } as unknown as Response;
}

function meetingWire(name: string, status = 'ended') {
    return {
        id: MEETING_ID,
        user_id: null,
        name,
        agenda: 'Decide the recorded launch plan',
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
        messages: [
            {
                id: '33333333-3333-4333-8333-333333333333',
                meeting_id: MEETING_ID,
                sender_type: 'user',
                sender_id: null,
                sender_name: 'You',
                content: 'What did the board decide?',
                citations: [],
                tool_artifacts: null,
                thinking_content: null,
                estimated_cost: 0,
                created_at: '2026-10-20T10:01:00.000000Z',
            },
        ],
    };
}

function sessionWire(index = 1) {
    return {
        run_id: `run-${index}`,
        package_version: 'package-1',
        meeting_id: MEETING_ID,
        label: `Recorded session ${index}`,
        provenance: { source: 'packaged' },
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
    };
}

function installReplayRouter(options: { meetingName?: (n: number) => string } = {}) {
    const calls: Call[] = [];
    let meetingReads = 0;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: unknown, init?: RequestInit) => {
            const url = String(input);
            const headers = new Headers(init?.headers);
            calls.push({
                url,
                method: init?.method ?? 'GET',
                headers,
                body:
                    typeof init?.body === 'string'
                        ? JSON.parse(init.body)
                        : undefined,
            });
            if (url === `${API}/replay/session`) {
                return json(200, sessionWire(meetingReads + 1));
            }
            if (url.endsWith(`/replay/meetings/${MEETING_ID}`)) {
                meetingReads += 1;
                return json(
                    200,
                    meetingWire(
                        options.meetingName?.(meetingReads) ?? 'Recorded product review'
                    )
                );
            }
            if (
                url.endsWith(`/replay/meetings/${MEETING_ID}/disagreements`) ||
                url.endsWith(`/replay/meetings/${MEETING_ID}/consensus`)
            ) {
                return json(200, []);
            }
            throw new Error(`Unexpected replay request: ${url}`);
        })
    );
    return calls;
}

function renderReplay() {
    return render(
        <Providers>
            <ReplayMeetingRoom meetingId={MEETING_ID} />
        </Providers>
    );
}

describe('recorded replay runtime', () => {
    beforeEach(() => {
        useRateLimitStore.setState({ providers: {} });
        useSettingsStore.setState({
            vaultUnlocked: false,
            vaultSalt: null,
            vaultCiphertexts: {},
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('renders the recorded room through replay reads only', async () => {
        const calls = installReplayRouter();
        renderReplay();

        expect(await screen.findByText('Recorded product review')).toBeInTheDocument();
        expect(screen.getByText('What did the board decide?')).toBeInTheDocument();
        expect(screen.getByText('Recorded session 1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /Summary/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /Shared Docs/ })).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Type your message...')).not.toBeInTheDocument();

        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
            expect(call.url.startsWith(`${API}/replay/`)).toBe(true);
            expect(call.headers.get('x-provider-key')).toBeNull();
        }
        expect(calls.some((call) => call.url.includes('/api/meetings'))).toBe(false);
    });

    it('does not expose or poll live closing in a recording', async () => {
        const calls = installReplayRouter();
        renderReplay();

        await screen.findByText('Recorded product review');

        expect(screen.queryByRole('tab', { name: /Close/ })).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Close meeting/i })
        ).not.toBeInTheDocument();
        expect(
            calls.filter((call) => call.url.includes('/closing'))
        ).toHaveLength(0);
        expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
    });

    it('does not hydrate the live vault, settings, or provider cooldown', async () => {
        installReplayRouter();
        useRateLimitStore.getState().recordCall('ollama');
        const cooldownUntil =
            useRateLimitStore.getState().providers.ollama?.cooldownUntil;
        const settingsBefore = useSettingsStore.getState().providers;
        const vaultBefore = useSettingsStore.getState().vaultCiphertexts;
        const storageRead = vi.spyOn(Storage.prototype, 'getItem');

        renderReplay();
        await screen.findByText('Recorded product review');

        expect(useRateLimitStore.getState().providers.ollama?.cooldownUntil).toBe(
            cooldownUntil
        );
        expect(useSettingsStore.getState().providers).toBe(settingsBefore);
        expect(useSettingsStore.getState().vaultCiphertexts).toBe(vaultBefore);
        expect(
            storageRead.mock.calls.some(([key]) => String(key).includes('sabha'))
        ).toBe(false);
    });

    it('restarts into a fresh epoch and replaces recorded records', async () => {
        const calls = installReplayRouter({
            meetingName: (n) => `Recorded product review ${n}`,
        });
        renderReplay();

        expect(await screen.findByText('Recorded product review 1')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Restart' }));

        expect(await screen.findByText('Recorded product review 2')).toBeInTheDocument();
        expect(screen.queryByText('Recorded product review 1')).not.toBeInTheDocument();
        expect(await screen.findByText('Recorded session 2')).toBeInTheDocument();
        expect(
            calls.filter((call) => call.url === `${API}/replay/session`).length
        ).toBe(2);
    });

    it('keeps a colliding live meeting cache intact while replay runs and restarts', async () => {
        const liveCalls: Call[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: unknown, init?: RequestInit) => {
                const url = String(input);
                liveCalls.push({
                    url,
                    method: init?.method ?? 'GET',
                    headers: new Headers(init?.headers),
                });
                if (url === `${API}/meetings/${MEETING_ID}`) {
                    return json(200, meetingWire('Live product review', 'active'));
                }
                if (url.endsWith('/turns')) return json(200, []);
                if (url.endsWith(`/meetings/${MEETING_ID}/disagreements`)) return json(200, []);
                if (url.endsWith(`/meetings/${MEETING_ID}/consensus`)) return json(200, []);
                if (url.endsWith(`/meetings/${MEETING_ID}/context-stats`)) {
                    return json(200, {
                        total_tokens: 0,
                        max_tokens: 128000,
                        utilization: 0,
                        by_participant: [],
                    });
                }
                if (url === `${API}/replay/session`) return json(200, sessionWire(1));
                if (url.endsWith(`/replay/meetings/${MEETING_ID}`)) {
                    const replayReads = liveCalls.filter((call) =>
                        call.url.endsWith(`/replay/meetings/${MEETING_ID}`)
                    ).length;
                    return json(
                        200,
                        meetingWire(`Recorded product review ${replayReads}`)
                    );
                }
                if (
                    url.endsWith(`/replay/meetings/${MEETING_ID}/disagreements`) ||
                    url.endsWith(`/replay/meetings/${MEETING_ID}/consensus`)
                ) {
                    return json(200, []);
                }
                throw new Error(`Unexpected request: ${url}`);
            })
        );

        render(
            <Providers>
                <LiveMeetingsRuntimeProvider>
                    <MeetingRoom meetingId={MEETING_ID} />
                </LiveMeetingsRuntimeProvider>
            </Providers>
        );
        expect(await screen.findByText('Live product review')).toBeInTheDocument();
        const liveReadsBefore = liveCalls.filter(
            (call) => call.url === `${API}/meetings/${MEETING_ID}`
        ).length;

        renderReplay();
        expect(
            await screen.findByText('Recorded product review 1')
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
        await waitFor(() =>
            expect(screen.getByText('Recorded product review 2')).toBeInTheDocument()
        );

        expect(screen.getByText('Live product review')).toBeInTheDocument();
        expect(
            liveCalls.filter((call) => call.url === `${API}/meetings/${MEETING_ID}`).length
        ).toBe(liveReadsBefore);
    });

    it('cannot repopulate a new epoch with a late recorded read', async () => {
        let resolveStale: (response: Response) => void = () => {};
        const stale = new Promise<Response>((resolve) => {
            resolveStale = resolve;
        });
        let sessions = 0;
        let disagreementReads = 0;
        const calls: string[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: unknown) => {
                const url = String(input);
                calls.push(url);
                if (url === `${API}/replay/session`) {
                    sessions += 1;
                    return json(200, sessionWire(sessions));
                }
                if (url.endsWith(`/replay/meetings/${MEETING_ID}`)) {
                    return json(200, meetingWire('Recorded product review'));
                }
                if (url.endsWith(`/replay/meetings/${MEETING_ID}/disagreements`)) {
                    disagreementReads += 1;
                    if (disagreementReads === 1) return stale;
                    return json(200, []);
                }
                if (url.endsWith(`/replay/meetings/${MEETING_ID}/consensus`)) {
                    return json(200, []);
                }
                throw new Error(`Unexpected replay request: ${url}`);
            })
        );
        renderReplay();
        expect(await screen.findByText('Recorded product review')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /Disagreements/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
        await waitFor(() =>
            expect(calls.filter((url) => url === `${API}/replay/session`).length).toBe(2)
        );

        resolveStale(
            json(200, [
                {
                    id: '44444444-4444-4444-8444-444444444444',
                    meeting_id: MEETING_ID,
                    source_ai_id: PARTICIPANT_ID,
                    target_name: 'You',
                    topic: 'Stale epoch disagreement',
                    reasoning: 'This read belongs to the replaced replay epoch.',
                    severity: 3,
                    status: 'open',
                    created_at: '2026-10-20T10:02:00.000000Z',
                },
            ])
        );

        await waitFor(() =>
            expect(screen.getByText('Recorded session 2')).toBeInTheDocument()
        );
        expect(screen.queryByText('Stale epoch disagreement')).not.toBeInTheDocument();
    });

    it('shows an honest unavailable state when replay is not configured', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => json(503, { detail: 'replay_not_configured' }))
        );
        renderReplay();

        expect(
            await screen.findByText('Recorded replay is not configured on this server.')
        ).toBeInTheDocument();
        expect(screen.queryByText('Recorded product review')).not.toBeInTheDocument();
    });
});
