/**
 * Observation lifecycle contracts (spec-07).
 *
 * A stream is observation only. EOF pauses locally and resume reattaches at
 * the persisted cursor; neither path submits generation. A terminal status
 * read reconciles without any subscriber.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/app/providers';
import { makeSseResponse, sseFrame } from '../../../../tests/fixtures/sse';
import { createScriptedFetch, type ScriptedFetch } from '../../../../tests/fixtures/transport';
import type { TurnOperation } from './turn-decoders';
import type { TurnEvent } from './turn-events';
import { useTurnProjectionStore } from './turn-projection';
import { useTurnObservation } from './use-turn-observation';

const operation: TurnOperation = {
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

function wire(sequence: number, overrides: Record<string, unknown>): string {
    return sseFrame(
        JSON.stringify({
            meeting_id: 'meeting-1',
            operation_id: 'operation-1',
            event_id: `event-${sequence}`,
            sequence,
            ...overrides,
        })
    );
}

let scripted: ScriptedFetch;
let queryClient: ReturnType<typeof makeQueryClient>;

function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    scripted = createScriptedFetch();
    queryClient = makeQueryClient();
    useTurnProjectionStore.getState().reset({
        meetingId: 'meeting-1',
        operationId: 'operation-1',
    });
});

afterEach(() => {
    scripted.reset();
    queryClient.clear();
});

describe('useTurnObservation', () => {
    it('streams into the operation projection and never calls submit', async () => {
        scripted.install();
        scripted.enqueueResponse(
            makeSseResponse([
                wire(1, { type: 'text', content: 'Hel' }),
                wire(2, { type: 'text', content: 'lo' }),
                wire(3, { type: 'tool_call', invocation_id: 'inv-1', call_id: 'call-1', tool_name: 'search_knowledge_base', arguments: { query: 'x' } }),
                wire(4, { type: 'done', message_id: 'message-1' }),
            ])
        );
        const onTerminal = vi.fn();
        const { result } = renderHook(
            () =>
                useTurnObservation({
                    meetingId: 'meeting-1',
                    operation,
                    onTerminal,
                }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.projection?.status).toBe('completed'));
        expect(result.current.projection?.text).toBe('Hello');
        expect(result.current.projection?.finalMessageId).toBe('message-1');
        expect(onTerminal).toHaveBeenCalledTimes(1);
        expect(scripted.calls).toHaveLength(1);
        expect(scripted.calls[0]?.input).toContain(
            '/meetings/meeting-1/turns/operation-1/events?after=0'
        );
        expect(scripted.calls[0]?.init?.method).toBeUndefined();
    });

    it('pauses on EOF and resumes from the last persisted sequence', async () => {
        scripted.install();
        scripted.enqueueResponse(
            makeSseResponse([wire(1, { type: 'text', content: 'partial' })])
        );
        const { result } = renderHook(
            () =>
                useTurnObservation({
                    meetingId: 'meeting-1',
                    operation,
                }),
            { wrapper }
        );

        await waitFor(() => expect(result.current.projection?.observationInterrupted).toBe(true));
        expect(result.current.projection?.text).toBe('partial');
        expect(result.current.projection?.terminal).toBeNull();
        expect(scripted.calls).toHaveLength(1);

        scripted.enqueueResponse(
            makeSseResponse([
                wire(2, { type: 'text', content: ' done' }),
                wire(3, { type: 'done', message_id: 'message-1' }),
            ])
        );
        act(() => result.current.resume());

        await waitFor(() => expect(result.current.projection?.status).toBe('completed'));
        expect(result.current.projection?.text).toBe('partial done');
        expect(scripted.calls).toHaveLength(2);
        expect(scripted.calls[1]?.input).toContain('events?after=1');
        expect(scripted.calls[1]?.init?.method).toBeUndefined();
    });

    it('reconciles a terminal status even when no stream ever connected', async () => {
        scripted.install();
        const onTerminal = vi.fn();
        const completed: TurnOperation = { ...operation, status: 'completed' };
        renderHook(
            () =>
                useTurnObservation({
                    meetingId: 'meeting-1',
                    operation: completed,
                    onTerminal,
                }),
            { wrapper }
        );

        await waitFor(() => expect(onTerminal).toHaveBeenCalledTimes(1));
        expect(onTerminal.mock.calls[0]?.[1]).toBe('completed');
        expect(scripted.calls).toHaveLength(0);
    });

    it('aborts observation on unmount without cancelling the operation', async () => {
        scripted.install();
        scripted.enqueueResponse(
            makeSseResponse([wire(1, { type: 'text', content: 'still running' })])
        );
        const { result, unmount } = renderHook(
            () =>
                useTurnObservation({
                    meetingId: 'meeting-1',
                    operation,
                }),
            { wrapper }
        );
        await waitFor(() => expect(result.current.projection?.text).toBe('still running'));

        unmount();
        expect(scripted.calls).toHaveLength(1);
        // Observation is a GET; no cancel/submit command is issued on detach.
        expect(scripted.calls[0]?.input).toContain('/events?after=0');
        expect(scripted.calls[0]?.init?.method).toBeUndefined();
    });
});
