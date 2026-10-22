/**
 * Closing query and command identity contracts (spec-08).
 *
 * Reads stay meeting-scoped, requesting a close sends one stable request
 * key, and retry/abort seed the canonical progress identity. Observation
 * never submits work.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/app/providers';
import { createScriptedFetch, type ScriptedFetch } from '../../../../tests/fixtures/transport';
import { closingKeys } from './closing-keys';
import { useClosing } from './closing-queries';
import { useAbortClosing, useRequestClosing, useRetryClosing } from './closing-mutations';
import { useClosingObservation } from './use-closing-observation';
import { meetingKeys } from './keys';
import { turnKeys } from './turn-keys';

const viewJson = (overrides: Record<string, unknown> = {}) => ({
    meeting_id: 'meeting-1',
    meeting_status: 'voting',
    archived: false,
    closing_id: 'closing-1',
    request_key: 'request-1',
    mode: 'vote',
    stage: 'draining',
    failed_from_stage: null,
    votes: [],
    summary: null,
    summary_message_id: null,
    error: null,
    retryable: false,
    abortable: true,
    created_at: '2026-10-22T09:59:00Z',
    updated_at: '2026-10-22T10:00:00Z',
    completed_at: null,
    ...overrides,
});

const receiptJson = {
    meeting_id: 'meeting-1',
    closing_id: 'closing-1',
    stage: 'draining',
    meeting_status: 'voting',
};

let scripted: ScriptedFetch;
let queryClient: ReturnType<typeof makeQueryClient>;

function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function trackInvalidations() {
    const invalidated: unknown[] = [];
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = ((filters: { queryKey: unknown }) => {
        invalidated.push(filters.queryKey);
        return original(filters as never);
    }) as typeof queryClient.invalidateQueries;
    return invalidated;
}

beforeEach(() => {
    scripted = createScriptedFetch();
    queryClient = makeQueryClient();
});

afterEach(() => {
    scripted.reset();
    queryClient.clear();
});

describe('closingKeys', () => {
    it('scopes every identity to one meeting', () => {
        expect(closingKeys.detail('meeting-1')).toEqual([
            'closings',
            'meeting',
            'meeting-1',
        ]);
        expect(closingKeys.detail('meeting-1')).not.toEqual(closingKeys.detail('meeting-2'));
    });
});

describe('closing reads', () => {
    it('loads durable progress for exactly one meeting', async () => {
        scripted.install();
        scripted.enqueueJson(200, viewJson());

        const { result } = renderHook(() => useClosing('meeting-1'), { wrapper });

        await waitFor(() => expect(result.current.data?.stage).toBe('draining'));
        expect(scripted.calls).toHaveLength(1);
        expect(scripted.calls[0]?.input).toBe(
            'http://localhost:8000/api/meetings/meeting-1/closing'
        );
        expect(scripted.calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    });
});

describe('closing commands', () => {
    it('requests a close with the stable key and summary overrides', async () => {
        scripted.install();
        scripted.enqueueJson(202, receiptJson);
        const invalidated = trackInvalidations();
        const { result } = renderHook(() => useRequestClosing(), { wrapper });

        await act(async () => {
            await result.current.mutateAsync({
                meetingId: 'meeting-1',
                mode: 'vote',
                requestKey: 'request-1',
                summarySettings: {
                    provider: 'openrouter',
                    model: 'anthropic/claude',
                    temperature: 0.2,
                    maxTokens: 1200,
                    baseUrl: 'https://example.test',
                },
            });
        });

        expect(scripted.calls[0]?.input).toBe(
            'http://localhost:8000/api/meetings/meeting-1/closing'
        );
        expect(scripted.calls[0]?.init?.method).toBe('POST');
        expect(JSON.parse(String(scripted.calls[0]?.init?.body))).toEqual({
            mode: 'vote',
            request_key: 'request-1',
            summary_settings: {
                provider: 'openrouter',
                model: 'anthropic/claude',
                temperature: 0.2,
                max_tokens: 1200,
                base_url: 'https://example.test',
            },
        });
        expect(invalidated).toContainEqual(closingKeys.detail('meeting-1'));
        expect(invalidated).toContainEqual(meetingKeys.detail('meeting-1'));
        expect(invalidated).toContainEqual(turnKeys.list('meeting-1'));
    });

    it('seeds retry and abort snapshots without replaying the request', async () => {
        scripted.install();
        scripted.enqueueJson(202, viewJson({ stage: 'summarizing', abortable: false }));
        scripted.enqueueJson(200, viewJson({ stage: 'aborted', meeting_status: 'active' }));
        const { result: retry } = renderHook(() => useRetryClosing(), { wrapper });
        const { result: abort } = renderHook(() => useAbortClosing(), { wrapper });

        await act(async () => {
            await retry.current.mutateAsync('meeting-1');
        });
        await act(async () => {
            await abort.current.mutateAsync('meeting-1');
        });

        expect(scripted.calls.map((call) => call.input)).toEqual([
            'http://localhost:8000/api/meetings/meeting-1/closing/retry',
            'http://localhost:8000/api/meetings/meeting-1/closing/abort',
        ]);
        expect(queryClient.getQueryData(closingKeys.detail('meeting-1'))).toMatchObject({
            stage: 'aborted',
            meeting_status: 'active',
        });
        expect(scripted.calls.every((call) => call.init?.method !== 'GET')).toBe(true);
    });
});

describe('closing observation', () => {
    it('reconciles a reloaded completed snapshot without submitting work', async () => {
        scripted.install();
        scripted.enqueueJson(
            200,
            viewJson({
                stage: 'completed',
                meeting_status: 'ended',
                summary: '📋 **MEETING ENDED**\nDone.',
                retryable: false,
                abortable: false,
                completed_at: '2026-10-22T10:05:00Z',
            })
        );
        const invalidated = trackInvalidations();
        const onSettled = vi.fn();

        const { result } = renderHook(
            () => useClosingObservation({ meetingId: 'meeting-1', onSettled }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.isSettled).toBe(true));
        expect(result.current.closing?.summary).toContain('MEETING ENDED');
        expect(result.current.isObserving).toBe(false);
        expect(onSettled).toHaveBeenCalledTimes(1);
        expect(onSettled.mock.calls[0]?.[0]).toMatchObject({ stage: 'completed' });
        expect(invalidated).toContainEqual(meetingKeys.detail('meeting-1'));
        expect(invalidated).toContainEqual(turnKeys.list('meeting-1'));
        expect(scripted.calls).toHaveLength(1);
        expect(scripted.calls[0]?.init?.method ?? 'GET').toBe('GET');
    });

    it('reports an advancing close as observed', async () => {
        scripted.install();
        scripted.enqueueJson(200, viewJson({ stage: 'voting' }));

        const { result } = renderHook(
            () => useClosingObservation({ meetingId: 'meeting-1' }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.closing?.stage).toBe('voting'));
        expect(result.current.isObserving).toBe(true);
        expect(result.current.isSettled).toBe(false);
    });
});
