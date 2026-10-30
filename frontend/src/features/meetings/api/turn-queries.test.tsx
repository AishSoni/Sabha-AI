/**
 * Turn query and command identity contracts (spec-07).
 *
 * Reads stay meeting-scoped, active queues poll, mutations seed/refresh the
 * same identities, and every command is one explicit request (retry off).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/app/providers';
import { createScriptedFetch, type ScriptedFetch } from '../../../../tests/fixtures/transport';
import { turnKeys } from './turn-keys';
import { useMeetingTurns } from './turn-queries';
import { useCancelTurn, useSubmitTurn } from './turn-mutations';

const operationJson = {
    operation_id: 'operation-1',
    meeting_id: 'meeting-1',
    participant_id: 'participant-1',
    request_key: 'request-1',
    status: 'queued',
    admission: 1,
    queue_position: 1,
    created_at: '2026-10-20T10:00:00Z',
    started_at: null,
    completed_at: null,
    final_message_id: null,
    cancel_requested: false,
    error: null,
    effective_generation: null,
};

let scripted: ScriptedFetch;
let queryClient: ReturnType<typeof makeQueryClient>;

function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    scripted = createScriptedFetch();
    queryClient = makeQueryClient();
});

afterEach(() => {
    scripted.reset();
    queryClient.clear();
});

describe('turnKeys', () => {
    it('keeps every identity scoped to its meeting and operation', () => {
        expect(turnKeys.list('meeting-1')).toEqual(['turns', 'meeting', 'meeting-1']);
        expect(turnKeys.detail('meeting-1', 'operation-1')).toEqual([
            'turns',
            'meeting',
            'meeting-1',
            'operation',
            'operation-1',
        ]);
        expect(turnKeys.list('meeting-1')).not.toEqual(turnKeys.list('meeting-2'));
        expect(turnKeys.detail('meeting-1', 'operation-1')).not.toEqual(
            turnKeys.detail('meeting-1', 'operation-2')
        );
    });
});

describe('turn reads', () => {
    it('loads the queue for exactly one meeting and decodes operations', async () => {
        scripted.install();
        scripted.enqueueJson(200, [operationJson]);

        const { result } = renderHook(() => useMeetingTurns('meeting-1'), { wrapper });

        await waitFor(() => expect(result.current.data).toHaveLength(1));
        expect(result.current.data?.[0]?.operation_id).toBe('operation-1');
        expect(scripted.calls[0]?.input).toBe(
            'http://localhost:8000/api/meetings/meeting-1/turns?limit=100'
        );
        expect(scripted.calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    });
});

describe('turn commands', () => {
    it('submits once, seeds the operation identity, and sends the BYOK header', async () => {
        scripted.install();
        scripted.enqueueJson(202, operationJson);
        const { result } = renderHook(() => useSubmitTurn(), { wrapper });

        await act(async () => {
            await result.current.mutateAsync({
                meetingId: 'meeting-1',
                participantId: 'participant-1',
                requestKey: 'request-1',
                settings: { provider: 'openrouter', apiKey: 'sk-secret' },
            });
        });

        expect(scripted.calls).toHaveLength(1);
        const headers = scripted.calls[0]?.init?.headers as Headers;
        expect(headers.get('x-provider-key')).toBe('sk-secret');
        expect(headers.get('authorization')).toBe('Bearer test-operator-token');
        expect(
            queryClient.getQueryData(turnKeys.detail('meeting-1', 'operation-1'))
        ).toMatchObject({ status: 'queued' });
        expect(queryClient.getQueryData(turnKeys.list('meeting-1'))).toHaveLength(1);
    });

    it('cancels through the operation route and refreshes only those identities', async () => {
        scripted.install();
        scripted.enqueueJson(200, { outcome: 'cancel_requested', status: 'executing' });
        queryClient.setQueryData(turnKeys.list('meeting-1'), [operationJson]);
        const invalidated: unknown[] = [];
        const original = queryClient.invalidateQueries.bind(queryClient);
        queryClient.invalidateQueries = ((filters: { queryKey: unknown }) => {
            invalidated.push(filters.queryKey);
            return original(filters as never);
        }) as typeof queryClient.invalidateQueries;

        const { result } = renderHook(() => useCancelTurn(), { wrapper });
        await act(async () => {
            await result.current.mutateAsync({
                meetingId: 'meeting-1',
                operationId: 'operation-1',
            });
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(scripted.calls[0]?.input).toBe(
            'http://localhost:8000/api/meetings/meeting-1/turns/operation-1/cancel'
        );
        expect(invalidated).toEqual([
            ['turns', 'meeting', 'meeting-1'],
            ['turns', 'meeting', 'meeting-1', 'operation', 'operation-1'],
        ]);
    });
});
