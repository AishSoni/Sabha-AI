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
import { renderHook, act, waitFor } from '@testing-library/react';
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
    state: 'pending',
    documentId: 'doc-1',
    operationId: 'op-1',
    revisionId: null,
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
    title: 'Pricing committee kickoff',
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
        scripted.enqueueJson(202, UPLOAD_OK);
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
        scripted.enqueueJson(202, UPLOAD_OK); // market-scan.pdf reaches the server
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
        expect(result.current.uploadError).toMatch(/1 of 2 files need attention/i);
        expect(push).not.toHaveBeenCalled();

        const uploadCalls = scripted.calls.filter((call) => call.input.endsWith('/documents/upload'));
        expect(uploadCalls).toHaveLength(2);

        scripted.enqueueJson(202, UPLOAD_OK); // unit-economics.xlsx reaches the server this time
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

    it('navigates once to the retained meeting when no files were staged', async () => {
        scripted.enqueueJson(201, MEETING);
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });

        expect(result.current.createdMeetingId).toBe('meeting-new-1');
        expect(result.current.creationError).toBeNull();
        expect(result.current.uploadError).toBeNull();
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
        expect(push).toHaveBeenCalledWith('/meetings/meeting-new-1');
        // No file work exists, so no upload request may stand in for success.
        expect(scripted.calls.filter((call) => call.input.endsWith('/documents/upload'))).toHaveLength(0);
    });

    it('does not create, upload, or navigate again when the work set is already complete', async () => {
        scripted.enqueueJson(201, MEETING);
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });
        expect(result.current.navigationDone).toBe(true);
        expect(push).toHaveBeenCalledTimes(1);

        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
            await result.current.retryUploads();
        });

        expect(scripted.calls.filter((call) => call.input === `${resolveApiBaseUrl()}/meetings`)).toHaveLength(1);
        expect(scripted.calls.filter((call) => call.input.endsWith('/documents/upload'))).toHaveLength(0);
        expect(push).toHaveBeenCalledTimes(1);
        expect(result.current.isCreating).toBe(false);
    });

    it('coalesces a second submit that lands before the first render', async () => {
        scripted.enqueueJson(201, MEETING);
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        await act(async () => {
            const first = result.current.createMeeting(CREATE_INPUT);
            const second = result.current.createMeeting(CREATE_INPUT);
            await Promise.all([first, second]);
        });

        expect(scripted.calls.filter((call) => call.input === `${resolveApiBaseUrl()}/meetings`)).toHaveLength(1);
        expect(push).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith('/meetings/meeting-new-1');
    });

    it('an all-success run navigates once after every file reached the server', async () => {
        scripted.enqueueJson(201, MEETING);
        scripted.enqueueJson(202, UPLOAD_OK);
        scripted.enqueueJson(202, UPLOAD_OK);
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

    it('keeps the accepted operation identity and never re-uploads an accepted file', async () => {
        scripted.enqueueJson(201, MEETING);
        scripted.enqueueJson(202, UPLOAD_OK);
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        act(() => {
            result.current.stageFiles([FILE_ONE()]);
        });
        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });

        expect(result.current.uploads[0]).toMatchObject({
            status: 'uploaded',
            documentId: 'doc-1',
            operationId: 'op-1',
            revisionId: null,
        });
        const uploadCalls = scripted.calls.filter((call) => call.input.endsWith('/documents/upload'));
        expect(uploadCalls).toHaveLength(1);

        await act(async () => {
            await result.current.retryUploads();
        });

        // A pending receipt is accepted, not ready. Retrying an accepted file
        // must not replay its bytes or create a second operation.
        expect(scripted.calls.filter((call) => call.input.endsWith('/documents/upload'))).toHaveLength(1);
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    });

    it('freezes the committed configuration and meeting key across an ambiguous retry', async () => {
        scripted.enqueueJson(500, { detail: 'connection reset' });
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });
        expect(result.current.configLocked).toBe(true);
        expect(result.current.creationError).toMatch(/connection reset/);

        scripted.enqueueJson(201, MEETING);
        await act(async () => {
            await result.current.createMeeting({
                title: 'Silently edited title',
                context: 'Edited context',
                personaIds: ['persona-2'],
            });
        });

        const createCalls = scripted.calls.filter(
            (call) => call.input === `${resolveApiBaseUrl()}/meetings`
        );
        expect(createCalls).toHaveLength(2);
        const first = JSON.parse(String(createCalls[0]!.init?.body));
        const second = JSON.parse(String(createCalls[1]!.init?.body));
        expect(second.name).toBe(CREATE_INPUT.title);
        expect(second.agenda).toBe(CREATE_INPUT.context);
        expect(second.persona_ids).toEqual(CREATE_INPUT.personaIds);
        expect(second.request_key).toBe(first.request_key);
        expect(result.current.committedConfig).toEqual(CREATE_INPUT);
    });

    it('unlocks a definitely rejected creation so the next submit is a new intent', async () => {
        scripted.enqueueJson(422, { detail: 'Unknown personas: persona-2' });
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });
        expect(result.current.configLocked).toBe(false);
        expect(result.current.createdMeetingId).toBeNull();

        scripted.enqueueJson(201, MEETING);
        await act(async () => {
            await result.current.createMeeting({
                title: 'Corrected title',
                context: '',
                personaIds: ['persona-1'],
            });
        });

        const createCalls = scripted.calls.filter(
            (call) => call.input === `${resolveApiBaseUrl()}/meetings`
        );
        const first = JSON.parse(String(createCalls[0]!.init?.body));
        const second = JSON.parse(String(createCalls[1]!.init?.body));
        expect(second.name).toBe('Corrected title');
        expect(second.request_key).not.toBe(first.request_key);
    });

    it('uses one stable upload key per intent across a retry', async () => {
        scripted.enqueueJson(201, MEETING);
        scripted.enqueueJson(500, { detail: 'storage down' });
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        act(() => {
            result.current.stageFiles([FILE_ONE()]);
        });
        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });
        expect(result.current.uploads[0]?.status).toBe('failed');
        expect(result.current.canContinue).toBe(true);

        scripted.enqueueJson(202, UPLOAD_OK);
        await act(async () => {
            await result.current.retryUploads();
        });

        const uploadCalls = scripted.calls.filter((call) => call.input.endsWith('/documents/upload'));
        expect(uploadCalls).toHaveLength(2);
        const firstKey = (uploadCalls[0]!.init!.body as FormData).get('request_key');
        const secondKey = (uploadCalls[1]!.init!.body as FormData).get('request_key');
        expect(firstKey).toBeTruthy();
        expect(secondKey).toBe(firstKey);
        expect(push).toHaveBeenCalledWith('/meetings/meeting-new-1');
    });

    it('accounts for files staged while an upload batch is in flight', async () => {
        scripted.enqueueJson(201, MEETING);
        const firstUpload = scripted.enqueuePendingJson(202, UPLOAD_OK);
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        act(() => {
            result.current.stageFiles([FILE_ONE()]);
        });
        let creation!: Promise<void>;
        act(() => {
            creation = result.current.createMeeting(CREATE_INPUT);
        });
        await waitFor(() =>
            expect(scripted.calls.filter((call) => call.input.endsWith('/documents/upload'))).toHaveLength(1)
        );

        // The admitted batch is already running; a new intended file joins it
        // instead of being left unaccounted behind a successful navigation.
        scripted.enqueueJson(202, UPLOAD_OK);
        act(() => {
            result.current.stageFiles([FILE_TWO()]);
        });
        expect(result.current.uploads.map((item) => item.status)).toEqual(['uploading', 'pending']);

        firstUpload.resolve();
        await act(async () => {
            await creation;
        });

        expect(scripted.calls.filter((call) => call.input.endsWith('/documents/upload'))).toHaveLength(2);
        expect(result.current.uploads.map((item) => item.status)).toEqual(['uploaded', 'uploaded']);
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    });

    it('allows only never-submitted items to be removed without a fake cancel', async () => {
        scripted.enqueueJson(201, MEETING);
        scripted.enqueueJson(202, UPLOAD_OK);
        const { result } = renderHook(() => useMeetingCreation(), { wrapper: Wrapper });

        act(() => {
            result.current.stageFiles([FILE_ONE(), FILE_TWO()]);
        });
        act(() => {
            result.current.removeUpload(1);
        });
        expect(result.current.uploads).toHaveLength(1);

        await act(async () => {
            await result.current.createMeeting(CREATE_INPUT);
        });
        expect(result.current.uploads[0]?.status).toBe('uploaded');

        act(() => {
            result.current.removeUpload(0);
        });
        // The server admitted this upload; the browser cannot pretend it was
        // cancelled by dropping the row.
        expect(result.current.uploads).toHaveLength(1);
    });
});
