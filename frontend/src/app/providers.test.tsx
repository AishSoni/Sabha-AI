/**
 * Contract for the app query composition (spec-05).
 *
 * The old screens either fetched in useEffect or shared one zustand store
 * instance, so a slow response for meeting A could repopulate meeting B's
 * selected UI. These tests pin down:
 *
 * - each query/cache identity is distinct (A and B never share an entry);
 * - a late resolution for A may populate A's cache entry but never mutates
 *   B's selected rendered state, buffers, or error flags;
 * - one browser client is reused across calls (no per-render refetch storms),
 *   while fresh clients are minted per server request (no shared mutable
 *   instance across RSC requests);
 * - mutations never auto-retry (a failed paid operation must not replay).
 */
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { getQueryClient, makeQueryClient, Providers } from './providers';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const detailKey = (meetingId: string) => ['meetings', 'detail', meetingId] as const;

type DetailFetcher = (meetingId: string) => Promise<string>;

function DetailProbe({ meetingId, fetchDetail }: { meetingId: string; fetchDetail: DetailFetcher }) {
    const { data, isPending, isError } = useQuery({
        queryKey: detailKey(meetingId),
        queryFn: () => fetchDetail(meetingId),
    });
    if (isError) return <div>error shown for {meetingId}</div>;
    return <div>{isPending ? `loading ${meetingId}` : `detail for ${data}`}</div>;
}

function MutationProbe({ onAttempt }: { onAttempt: () => Promise<void> }) {
    const mutation = useMutation({ mutationFn: onAttempt });
    return (
        <button
            type="button"
            onClick={() => mutation.mutate()}
        >
            fire
        </button>
    );
}

describe('query client identity', () => {
    it('mints a fresh client for every makeQueryClient call (fresh per server request)', () => {
        const serverA = makeQueryClient();
        const serverB = makeQueryClient();

        expect(serverA).not.toBe(serverB);

        // A mutation of A's cache must not leak across requests.
        act(() => {
            serverA.setQueryData(detailKey('a'), 'agenda-a');
        });
        expect(serverB.getQueryData(detailKey('a'))).toBeUndefined();
    });

    it('reuses one client across calls in the browser', () => {
        expect(getQueryClient()).toBe(getQueryClient());
    });

    it('gives A and B distinct cache identities with no cross-entry leakage', async () => {
        const client = makeQueryClient();
        const lateA = deferred<string>();

        const fetchDetail: DetailFetcher = (id) => {
            if (id === 'b') return Promise.resolve('agenda-b');
            return lateA.promise;
        };

        let selected = 'a';
        function Harness() {
            return (
                <QueryClientProvider client={client}>
                    <DetailProbe meetingId={selected} fetchDetail={fetchDetail} />
                </QueryClientProvider>
            );
        }
        const { rerender } = render(<Harness />);

        await waitFor(() => screen.getByText('loading a'));

        // Navigate to B while A's request is still in flight.
        selected = 'b';
        rerender(<Harness />);
        await waitFor(() => screen.getByText('detail for agenda-b'));
        expect(screen.queryByText(/loading a/)).toBeNull();
        expect(screen.queryByText(/error shown/)).toBeNull();

        // Resolve A late: allowed to populate A's own cache entry...
        await act(async () => {
            lateA.resolve('agenda-a');
        });
        expect(client.getQueryData(detailKey('a'))).toBe('agenda-a');

        // ...but B's selected rendered state must be untouched.
        expect(screen.getByText('detail for agenda-b')).toBeDefined();
        expect(screen.queryByText(/detail for agenda-a/)).toBeNull();
        expect(screen.queryByText(/error shown/)).toBeNull();
    });

    it('renders children through the Providers boundary', () => {
        render(
            <Providers>
                <div>room child</div>
            </Providers>
        );
        expect(screen.getByText('room child')).toBeDefined();
    });
});

describe('mutation policy', () => {
    it('never auto-retries a failed mutation (no replay of paid operations)', async () => {
        const onAttempt = vi.fn(async () => {
            throw new Error('generation failed');
        });

        render(
            <Providers>
                <MutationProbe onAttempt={onAttempt} />
            </Providers>
        );

        screen.getByText('fire').click();

        await waitFor(() => expect(onAttempt).toHaveBeenCalledTimes(1));
        // A retry policy would schedule the next attempt; allow at least one
        // retry window to elapse before asserting the count stayed at one.
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(onAttempt).toHaveBeenCalledTimes(1);
    });
});
