/**
 * Contract for the meetings mutation layer (spec-05).
 *
 * Mutations own the command policy: create seeds the fresh detail entry and
 * invalidates the list identity; archive and unarchive revise the cached
 * detail status and invalidate the list; delete removes the detail entry.
 * A late stale list snapshot never regresses a newer committed entry, and a
 * failed command never caches and never replays.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/app/providers';
import { resolveApiBaseUrl } from '@/shared/api/transport';
import { isApiError } from '@/shared/api/errors';
import { createScriptedFetch, type PendingJsonHandle, type ScriptedFetch } from '../../../../tests/fixtures/transport';
import { meetingKeys } from './keys';
import { useArchiveMeeting, useCreateMeeting, useDeleteMeeting, useUnarchiveMeeting } from './mutations';
import { useMeetingList } from './queries';

let scripted: ScriptedFetch;
let queryClient: ReturnType<typeof makeQueryClient>;

const CREATED_AT = '2026-10-19T00:00:00.000Z';

const meetingJson = (overrides: Partial<Record<string, unknown>>) => ({
    id: 'm-1',
    user_id: null,
    name: 'Board review',
    agenda: 'Ship the spec',
    status: 'active',
    total_cost: 0,
    created_at: CREATED_AT,
    ...overrides,
});

const detailJson = (overrides: Record<string, unknown>) => ({
    ...meetingJson({}),
    participants: [],
    messages: [],
    ...overrides,
});

const createdResponseJson = meetingJson({
    id: 'm-new',
    name: 'Fresh board',
    participants: [],
    messages: [],
});

function ListProbe() {
    const query = useMeetingList();
    if (query.isError) return <div>list error: {String(query.error?.message)}</div>;
    return (
        <div>
            {query.isPending
                ? 'list loading'
                : `list: ${query.data?.map((meeting) => `${meeting.id}:${meeting.name}`).join(', ')}`}
        </div>
    );
}

let outcome: Promise<unknown> = Promise.resolve(undefined);

function CreateProbe({ agenda }: { agenda: string }) {
    const { mutateAsync } = useCreateMeeting();
    return (
        <button
            type="button"
            onClick={() => {
                outcome = mutateAsync({ name: 'Fresh board', agenda, personaIds: ['p-1'] }).catch(
                    (error: unknown) => error
                );
            }}
        >
            create
        </button>
    );
}

function ArchiveProbe({ meetingId }: { meetingId: string }) {
    const { mutateAsync } = useArchiveMeeting();
    return (
        <button
            type="button"
            onClick={() => {
                outcome = mutateAsync(meetingId).catch((error: unknown) => error);
            }}
        >
            archive
        </button>
    );
}

function UnarchiveProbe({ meetingId }: { meetingId: string }) {
    const { mutateAsync } = useUnarchiveMeeting();
    return (
        <button
            type="button"
            onClick={() => {
                outcome = mutateAsync(meetingId).catch((error: unknown) => error);
            }}
        >
            unarchive
        </button>
    );
}

function DeleteProbe({ meetingId }: { meetingId: string }) {
    const { mutateAsync } = useDeleteMeeting();
    return (
        <button
            type="button"
            onClick={() => {
                outcome = mutateAsync(meetingId).catch((error: unknown) => error);
            }}
        >
            delete
        </button>
    );
}

function UiHarness({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    scripted = createScriptedFetch();
    queryClient = makeQueryClient();
    outcome = Promise.resolve(undefined);
});

afterEach(() => {
    scripted.reset();
});

describe('create meeting', () => {
    it('posts the command payload and seeds the created detail entry', async () => {
        scripted.install();
        scripted.enqueueJson(200, createdResponseJson);

        render(
            <UiHarness>
                <CreateProbe agenda="Ship the spec" />
            </UiHarness>
        );

        screen.getByText('create').click();
        await outcome;

        expect(scripted.calls[0]?.input).toBe(`${resolveApiBaseUrl()}/meetings`);
        expect(JSON.parse(scripted.calls[0]?.init?.body as string)).toEqual({
            name: 'Fresh board',
            agenda: 'Ship the spec',
            persona_ids: ['p-1'],
        });
        expect(queryClient.getQueryData(meetingKeys.detail('m-new'))).toMatchObject({
            id: 'm-new',
            name: 'Fresh board',
        });
    });

    it('invalidates the list identity on success', async () => {
        scripted.install();
        scripted.enqueueJson(200, createdResponseJson);

        await act(async () => {
            queryClient.setQueryData(meetingKeys.list(), [meetingJson({})]);
        });

        render(
            <UiHarness>
                <CreateProbe agenda="" />
            </UiHarness>
        );

        screen.getByText('create').click();
        await outcome;

        expect(queryClient.getQueryState(meetingKeys.list())?.isInvalidated).toBe(true);
    });

    it('a stale list refetch cannot regress the created detail entry', async () => {
        const staleListHandle: PendingJsonHandle = scripted.enqueuePendingJson(200, [
            meetingJson({}),
        ]);
        scripted.install();
        // Create response, then the invalidated list refetch that still
        // returns the pre-create snapshot.
        scripted.enqueueJson(200, createdResponseJson);
        scripted.enqueueJson(200, [meetingJson({})]);

        render(
            <UiHarness>
                <ListProbe />
                <CreateProbe agenda="Ship the spec" />
            </UiHarness>
        );

        await waitFor(() => screen.getByText('list loading'));
        staleListHandle.resolve();
        await waitFor(() => screen.getByText('list: m-1:Board review'));

        screen.getByText('create').click();
        await outcome;

        // Invalidation refetches the list after the first fetch settled.
        await waitFor(() => expect(scripted.calls).toHaveLength(3));

        // The stale legal snapshot commits onto the list identity...
        expect(screen.getByText('list: m-1:Board review')).toBeDefined();
        // ...but the newer committed detail entry must survive untouched.
        expect(queryClient.getQueryData(meetingKeys.detail('m-new'))).toMatchObject({
            id: 'm-new',
            name: 'Fresh board',
        });
    });

    it('a failed create surfaces once, shells out an ApiError, and caches nothing', async () => {
        scripted.install();
        scripted.enqueueJson(422, { detail: 'Unknown persona selected' });

        render(
            <UiHarness>
                <CreateProbe agenda="" />
            </UiHarness>
        );

        screen.getByText('create').click();
        const error = (await outcome) as unknown;

        expect(isApiError(error)).toBe(true);
        if (isApiError(error)) {
            expect(error.status).toBe(422);
            expect(error.detail).toBe('Unknown persona selected');
        }
        expect(queryClient.getQueryData(meetingKeys.detail('m-new'))).toBeUndefined();
        expect(scripted.calls).toHaveLength(1);
    });
});

describe('archive and unarchive', () => {
    it('archive revises the cached detail status and invalidates the list', async () => {
        scripted.install();
        scripted.enqueueJson(200, { success: true, message: 'Meeting archived successfully' });

        await act(async () => {
            queryClient.setQueryData(meetingKeys.detail('m-1'), detailJson({}));
            queryClient.setQueryData(meetingKeys.list(), [meetingJson({})]);
        });

        render(
            <UiHarness>
                <ArchiveProbe meetingId="m-1" />
            </UiHarness>
        );

        screen.getByText('archive').click();
        await outcome;

        expect(scripted.calls[0]?.input).toBe(`${resolveApiBaseUrl()}/meetings/m-1/archive`);
        expect(queryClient.getQueryData(meetingKeys.detail('m-1'))).toMatchObject({
            status: 'archived',
        });
        expect(queryClient.getQueryState(meetingKeys.list())?.isInvalidated).toBe(true);
    });

    it('unarchive invalidates instead of guessing a reopened status', async () => {
        scripted.install();
        scripted.enqueueJson(200, {
            success: true,
            message: 'Meeting unarchived successfully',
            status: 'ended',
        });

        await act(async () => {
            queryClient.setQueryData(meetingKeys.detail('m-1'), detailJson({ status: 'archived' }));
            queryClient.setQueryData(meetingKeys.list(), [meetingJson({ status: 'archived' })]);
        });

        render(
            <UiHarness>
                <UnarchiveProbe meetingId="m-1" />
            </UiHarness>
        );

        screen.getByText('unarchive').click();
        await outcome;

        expect(scripted.calls[0]?.input).toBe(`${resolveApiBaseUrl()}/meetings/m-1/unarchive`);
        // Unarchiving never reopens an ended meeting: the cache is refreshed
        // from the server rather than patched to `active`.
        expect(queryClient.getQueryData(meetingKeys.detail('m-1'))).toMatchObject({
            status: 'archived',
        });
        expect(queryClient.getQueryState(meetingKeys.detail('m-1'))?.isInvalidated).toBe(true);
        expect(queryClient.getQueryState(meetingKeys.list())?.isInvalidated).toBe(true);
    });
});

describe('delete meeting', () => {
    it('removes the detail entry and invalidates the list identity', async () => {
        scripted.install();
        scripted.enqueueJson(200, { success: true });

        await act(async () => {
            queryClient.setQueryData(meetingKeys.detail('m-1'), detailJson({}));
            queryClient.setQueryData(meetingKeys.list(), [meetingJson({})]);
        });

        render(
            <UiHarness>
                <DeleteProbe meetingId="m-1" />
            </UiHarness>
        );

        screen.getByText('delete').click();
        await outcome;

        expect(scripted.calls[0]?.input).toBe(`${resolveApiBaseUrl()}/meetings/m-1`);
        expect(scripted.calls[0]?.init?.method).toBe('DELETE');
        expect(queryClient.getQueryData(meetingKeys.detail('m-1'))).toBeUndefined();
        expect(queryClient.getQueryState(meetingKeys.list())?.isInvalidated).toBe(true);
    });
});
