// Demo recorded-turn transport: journal subscription + actor attribution.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { api, authHeaders, isDemoSessionFor } from '@/lib/api';
import { encodeSSE, mockFetchStream, splitBytes, toByteStream } from '@/test/sse';

const JOURNAL_URL = 'http://localhost:8000/api/meetings/turns/t-1/events?after=0';
const DEMO_START_URL = 'http://localhost:8000/api/v2/demo/recorded-turn';

afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
});

describe('demo actor attribution', () => {
    it('attributes demo tab sessions to the demo owner and normal use to local identity', () => {
        sessionStorage.setItem('sabha.demo.sessionToken', 'real-m-demo');
        expect(isDemoSessionFor('m-demo')).toBe(true);
        expect(isDemoSessionFor('other')).toBe(false);
        expect(authHeaders().Authorization).toBe('Bearer demo-visitor');

        sessionStorage.removeItem('sabha.demo.sessionToken');
        expect(isDemoSessionFor('m-demo')).toBe(false);
        expect(authHeaders().Authorization).toBe('Bearer local-dev');
    });
});

describe('subscribeTurnJournal', () => {
    it('replays the journal with v2 framing and maps multi text_delta + terminal', async () => {
        sessionStorage.setItem('sabha.demo.sessionToken', 'real-m-demo');
        const payload = encodeSSE([
            { version: 2, turn_id: 't-1', sequence: 1, type: 'turn_started' },
            { version: 2, turn_id: 't-1', sequence: 2, type: 'text_delta', data: { content: 'The ' } },
            { version: 2, turn_id: 't-1', sequence: 3, type: 'text_delta', data: { content: 'bond pays 7.87%.' } },
            { version: 2, turn_id: 't-1', sequence: 4, type: 'citation', data: { snippet: 'TS-V-007 excerpt' } },
            {
                version: 2,
                turn_id: 't-1',
                sequence: 5,
                type: 'turn_completed',
                data: { message_id: 'msg-1', usage_completeness: 'unknown' },
            },
        ]);
        const chunks = splitBytes(payload, [40, 90, 160]);
        const seen: Array<Record<string, unknown>> = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                expect(url).toBe(JOURNAL_URL);
                expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer demo-visitor');
                return mockFetchStream(toByteStream(chunks));
            }),
        );

        const outcome = await api.subscribeTurnJournal({
            meetingId: 'm-demo',
            turnId: 't-1',
            signal: new AbortController().signal,
            onEvent: (e) => seen.push(e as unknown as Record<string, unknown>),
        });

        expect(outcome.terminal?.kind).toBe('terminal');
        expect(outcome.terminal?.terminalKind).toBe('completed');
        expect(outcome.eofWithoutTerminal).toBe(false);
        const kinds = seen.map((e) => e.kind);
        expect(kinds.filter((k) => k === 'text_delta').length).toBe(2);
        const joined = seen
            .filter((e) => e.kind === 'text_delta')
            .map((e) => String(e.content ?? ''))
            .join('');
        expect(joined).toBe('The bond pays 7.87%.');
        expect(seen.some((e) => e.kind === 'citation')).toBe(true);
        expect(seen.every((e) => e.turnId === 't-1')).toBe(true);
    });

    it('reports EOF without terminal so callers can reconnect', async () => {
        const payload = encodeSSE([
            { version: 2, turn_id: 't-1', sequence: 1, type: 'text_delta', data: { content: 'partial' } },
        ]);
        vi.stubGlobal('fetch', vi.fn(async () => mockFetchStream(toByteStream([payload]))));
        const seen: Array<Record<string, unknown>> = [];
        const outcome = await api.subscribeTurnJournal({
            meetingId: 'm-demo',
            turnId: 't-1',
            signal: new AbortController().signal,
            onEvent: (e) => seen.push(e as unknown as Record<string, unknown>),
        });
        expect(outcome.terminal).toBeNull();
        expect(outcome.eofWithoutTerminal).toBe(true);
        expect(seen.length).toBe(1);
    });
});

describe('startDemoRecordedTurn', () => {
    it('posts the recorded trigger with the pinned action and returns the turn identity', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                expect(url).toBe(DEMO_START_URL);
                return {
                    ok: true,
                    status: 202,
                    json: async () => ({
                        turn_id: 't-9',
                        meeting_id: 'm-demo',
                        participant_id: 'p-analyst',
                        participant_name: 'The Analyst',
                        action_id: 'submit_bond_question',
                        events_url: '/api/meetings/turns/t-9/events',
                        recorded_analysis: true,
                        approval_status: 'demo',
                        disclosure: 'recorded analysis',
                    }),
                } as Response;
            }),
        );
        const start = await api.startDemoRecordedTurn({ meetingId: 'm-demo', idempotencyKey: 'k-1' });
        expect(start.turn_id).toBe('t-9');
        expect(start.recorded_analysis).toBe(true);
    });

    it('maps honest demo failures to typed ApiErrors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: false,
                status: 409,
                json: async () => ({ code: 'tool_result_mismatch', detail: 'seed drift' }),
            }) as Response),
        );
        await expect(api.startDemoRecordedTurn({ meetingId: 'm-demo' })).rejects.toMatchObject({
            status: 409,
        });
    });
});
