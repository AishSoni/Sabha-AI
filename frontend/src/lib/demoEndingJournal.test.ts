// Shared ending journal: demo recorded ending through the 202 workflow.
// Replay + live subscribe: dedup by sequence, EOF never implies completion.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { api } from '@/lib/api';
import { encodeSSE, mockFetchStream, splitBytes, toByteStream } from '@/test/sse';

const ATTEMPTS_URL = 'http://localhost:8000/api/meetings/m-demo/ending-attempts';
const JOURNAL_URL = 'http://localhost:8000/api/meetings/ending-attempts/end-x/events?after=0';
const STATE_URL = 'http://localhost:8000/api/meetings/ending-attempts/end-x';

afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
});

function ballot(name: string, seq: number) {
    return {
        version: 2,
        sequence: seq,
        ending_attempt_id: 'end-x',
        type: 'vote_recorded',
        data: {
            participant_id: `p-${seq}`,
            participant_name: name,
            vote: true,
            reason: 'Recorded ballot: support the closing brief.',
        },
    };
}

describe('startEndingAttempt', () => {
    it('posts the shared 202 trigger with demo attribution and returns attempt identity', async () => {
        sessionStorage.setItem('sabha.demo.sessionToken', 'real-m-demo');
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                expect(url).toBe(ATTEMPTS_URL);
                expect(JSON.parse(String(init?.body))).toEqual({ force_end: false });
                expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer demo-visitor');
                return new Response(
                    JSON.stringify({
                        attempt_id: 'end-x',
                        meeting_id: 'm-demo',
                        state: 'in_progress',
                        duplicate: false,
                        events_url: '/api/meetings/ending-attempts/end-x/events',
                    }),
                    { status: 202 },
                );
            }),
        );

        const start = await api.startEndingAttempt({ meetingId: 'm-demo', forceEnd: false });

        expect(start.attempt_id).toBe('end-x');
        expect(start.duplicate).toBe(false);
        expect(start.events_url).toBe('/api/meetings/ending-attempts/end-x/events');
    });
});

describe('subscribeEndingJournal', () => {
    it('replays vote/brief events and captures the terminal, dropping duplicate sequences', async () => {
        sessionStorage.setItem('sabha.demo.sessionToken', 'real-m-demo');
        const payload = encodeSSE([
            { version: 2, sequence: 1, ending_attempt_id: 'end-x', type: 'ending_started', data: { force_end: false } },
            ballot('Credit & Business specialist', 2),
            // Sequence 2 duplicate frame: dropped, never concatenated twice.
            { version: 2, sequence: 2, ending_attempt_id: 'end-x', type: 'summary_delta', data: { content: 'DUP', index: 0 } },
            ballot('Treasury & Market specialist', 3),
            { version: 2, sequence: 4, ending_attempt_id: 'end-x', type: 'summary_delta', data: { content: 'Executive brief chunk', index: 1 } },
            {
                version: 2,
                sequence: 5,
                ending_attempt_id: 'end-x',
                type: 'ending_completed',
                data: { outcome: 'completed', success: true, summary: null, committed: true, usage: { vote_calls: 3 } },
            },
        ]);
        const chunks = splitBytes(payload, [90, 170]);
        const seen: Array<Record<string, unknown>> = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                expect(url).toBe(JOURNAL_URL);
                expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer demo-visitor');
                return mockFetchStream(toByteStream(chunks));
            }),
        );

        const outcome = await api.subscribeEndingJournal({
            attemptId: 'end-x',
            signal: new AbortController().signal,
            onEvent: (e) => seen.push(e as unknown as Record<string, unknown>),
        });

        expect(outcome.terminal?.type).toBe('ending_completed');
        expect(outcome.eofWithoutTerminal).toBe(false);
        expect((outcome.terminal?.data as { outcome?: string }).outcome).toBe('completed');
        expect(seen.filter((e) => e.type === 'vote_recorded').length).toBe(2);
        const brief = seen
            .filter((e) => e.type === 'summary_delta')
            .map((e) => String((e.data as { content?: string }).content ?? ''))
            .join('');
        expect(brief).toBe('Executive brief chunk');
        expect(seen.some((e) => e.type === 'ending_failed')).toBe(false);
    });

    it('reports EOF without terminal so callers reconcile via authoritative state', async () => {
        sessionStorage.setItem('sabha.demo.sessionToken', 'real-m-demo');
        const payload = encodeSSE([
            ballot('Bond Structure & Downside specialist', 1),
        ]);
        vi.stubGlobal('fetch', vi.fn(async () => mockFetchStream(toByteStream([payload]))));
        const seen: Array<Record<string, unknown>> = [];

        const outcome = await api.subscribeEndingJournal({
            attemptId: 'end-x',
            signal: new AbortController().signal,
            onEvent: (e) => seen.push(e as unknown as Record<string, unknown>),
        });

        expect(outcome.terminal).toBeNull();
        expect(outcome.eofWithoutTerminal).toBe(true);
        expect(seen.length).toBe(1);
    });
});

describe('getEndingAttempt', () => {
    it('fetches authoritative attempt state with demo attribution', async () => {
        sessionStorage.setItem('sabha.demo.sessionToken', 'real-m-demo');
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                expect(url).toBe(STATE_URL);
                expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer demo-visitor');
                return new Response(
                    JSON.stringify({
                        attempt_id: 'end-x',
                        meeting_id: 'm-demo',
                        state: 'completed',
                        outcome: 'completed',
                        summary: 'Executive brief for INE001A07RW5.',
                        usage: { vote_calls: 3, summary_calls: 1 },
                        votes: [],
                    }),
                    { status: 200 },
                );
            }),
        );

        const view = await api.getEndingAttempt('end-x');

        expect(view.outcome).toBe('completed');
        expect(view.state).toBe('completed');
        expect(view.summary).toContain('INE001A07RW5');
    });
});
