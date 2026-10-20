// @vitest-environment happy-dom
/**
 * Resumable meeting creation against the feature hook (spec-02 D' semantics
 * preserved while the create flow moves onto the canonical meeting and
 * document capabilities):
 *
 * - the meeting row is created exactly once; upload retries never create
 *   duplicates;
 * - a failed creation is distinguishable from a failed upload and nothing is
 *   uploaded before the meeting exists;
 * - a retry re-uploads ONLY the files that did not succeed;
 * - navigation happens once, only after every file reached a terminal state.
 */
import { useState, type ReactNode } from 'react';
import { render, renderHook, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useMeetingCreation } from '@/features/meetings';
import { makeQueryClient } from '@/app/providers';
import { resolveApiBaseUrl } from '@/shared/api/transport';
import { createScriptedFetch } from '../../../../tests/fixtures/transport';

const push = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, back: vi.fn() }),
}));

const MEETING = {
    id: 'meeting-new-1',
    name: 'Pricing committee kickoff',
    agenda: '',
    status: 'active',
    total_cost: 0,
    created_at: '2026-10-20T00:00:00Z',
    participants: [],
    messages: [],
};

const UPLOAD_OK = {
    id: 'doc-1',
    file_name: 'market-scan.pdf',
    status: 'processing',
    chunk_count: 0,
    message: 'queued for indexing',
};

const FILE_ONE = () => new File(['one'], 'market-scan.pdf', { type: 'application/pdf' });
const FILE_TWO = () => new File(['two'], 'unit-economics.xlsx', { type: 'application/vnd.ms-excel' });

function Wrapper({ children }: { children: ReactNode }) {
    const [client] = useState(makeQueryClient);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const CREATE_INPUT = {
    agenda: 'Pricing committee kickoff',
    context: '',
    personaIds: ['persona-1'],
};

describe('useMeetingCreation resume semantics', () => {
    const scripted = createScriptedFetch();

    beforeEach(() => {
        push.mockReset();
        scripted.install();
    });

    afterEach(() => {
        scripted.reset();
    });

    it('a failed creation surfaces its own error, uploads nothing, and a retry creates the row', async () => {
        scripted.enqueueJson(500, { detail: 'database unreachable' });
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        act(() => {
            result.current.stageFiles([FILE_ONE()]);
        });
        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });

        expect(result.current.creationError).toMatch(/Failed to create the meeting/);
        expect(result.current.creationError).toContain('database unreachable');
        expect(result.current.uploadError).toBeNull();
        expect(result.current.createdMeetingId).toBeNull();
        // Only the creation attempt left the browser; no upload ran without a meeting.
        expect(scripted.calls).toHaveLength(1);
        expect(push).not.toHaveBeenCalled();

        scripted.enqueueJson(201, MEETING);
        scripted.enqueueJson(201, UPLOAD_OK);
        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });

        expect(result.current.creationError).toBeNull();
        const createCalls = scripted.calls.filter((call) => call.input === `${resolveApiBaseUrl()}/meetings`);
        expect(createCalls).toHaveLength(2);
        await waitFor(() => expect(push).toHaveBeenCalledWith('/meetings/meeting-new-1'));
    });

    it('upload failures keep the created meeting and a retry re-uploads only the failed files', async () => {
        scripted.enqueueJson(201, MEETING); // create succeeds exactly once
        scripted.enqueueJson(201, UPLOAD_OK); // market-scan.pdf reaches the server
        scripted.enqueueJson(500, { detail: 'storage down' }); // unit-economics.xlsx fails
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        act(() => {
            result.current.stageFiles([FILE_ONE(), FILE_TWO()]);
        });
        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });

        expect(result.current.createdMeetingId).toBe('meeting-new-1');
        expect(result.current.uploads.map((item) => item.status)).toEqual(['uploaded', 'failed']);
        expect(result.current.uploads[1]?.error).toBe('storage down');
        expect(result.current.uploadError).toMatch(/1 of 2 files failed to upload/);
        expect(push).not.toHaveBeenCalled();

        const uploadCalls = scripted.calls.filter((call) => call.input.endsWith('/documents/upload'));
        expect(uploadCalls).toHaveLength(2);

        scripted.enqueueJson(201, UPLOAD_OK); // unit-economics.xlsx reaches the server this time
        await act(async () => {
            await result.current.retryUploads();
        });

        expect(scripted.calls.filter((call) => call.input.endsWith('/documents/upload'))).toHaveLength(3);
        expect(result.current.uploads.map((item) => item.status)).toEqual(['uploaded', 'uploaded']);
        expect(result.current.uploadError).toBeNull();
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
        expect(push).toHaveBeenCalledWith('/meetings/meeting-new-1');
        // The meeting was created exactly once across both phases.
        expect(scripted.calls.filter((call) => call.input === `${resolveApiBaseUrl()}/meetings`)).toHaveLength(1);
    });

    it('an all-success run navigates once after every file reached the server', async () => {
        scripted.enqueueJson(201, MEETING);
        scripted.enqueueJson(201, UPLOAD_OK);
        scripted.enqueueJson(201, UPLOAD_OK);
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        act(() => {
            result.current.stageFiles([FILE_ONE(), FILE_TWO()]);
        });
        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });

        expect(result.current.uploads.map((item) => item.status)).toEqual(['uploaded', 'uploaded']);
        expect(result.current.uploadError).toBeNull();
        expect(result.current.creationError).toBeNull();
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
        expect(push).toHaveBeenCalledWith('/meetings/meeting-new-1');
    });
});
