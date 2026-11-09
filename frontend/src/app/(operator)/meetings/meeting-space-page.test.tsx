import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/errors';

const listState = vi.hoisted(() => ({
    data: undefined as unknown[] | undefined,
    isLoading: false,
    isError: false,
    error: null as Error | null,
}));
const refetch = vi.hoisted(() => vi.fn());
const mutate = vi.hoisted(() => vi.fn());

vi.mock('@/features/meetings', () => ({
    useMeetingList: () => ({ ...listState, refetch }),
    useArchiveMeeting: () => ({ mutate }),
    useUnarchiveMeeting: () => ({ mutate }),
    useDeleteMeeting: () => ({ mutate }),
    meetingKeys: {
        detail: (meetingId: string) => ['meetings', 'detail', meetingId],
    },
}));

import MeetingSpacePage from './page';

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MeetingSpacePage />
        </QueryClientProvider>
    );
}

describe('meeting space reads', () => {
    beforeEach(() => {
        refetch.mockClear();
        mutate.mockClear();
    });

    it('shows an unavailable state instead of an empty list on the first read failure', () => {
        listState.data = undefined;
        listState.isLoading = false;
        listState.isError = true;
        listState.error = new ApiError('http', 500, 'Database unavailable');

        renderPage();

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Meeting space unavailable'
        );
        expect(
            screen.getByText(/Meeting space could not be loaded: Database unavailable/)
        ).toBeInTheDocument();
        expect(screen.queryByText('No meeting rooms yet')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('keeps the last loaded meetings visible when a refetch fails', () => {
        listState.data = [
            {
                id: 'meeting-1',
                name: 'Existing meeting',
                status: 'active',
                agenda: 'Keep working',
                created_at: '2026-11-01T10:00:00Z',
                total_cost: 0,
            },
        ];
        listState.isLoading = false;
        listState.isError = true;
        listState.error = new ApiError('network', null, 'Network request failed');

        renderPage();

        expect(screen.getByText('Existing meeting')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
            'Showing the last loaded meetings.'
        );
        expect(
            screen.getByText(/Meeting space could not be reached/)
        ).toBeInTheDocument();
        expect(screen.queryByText('No meeting rooms yet')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('shows the empty state only after a successful empty read', () => {
        listState.data = [];
        listState.isLoading = false;
        listState.isError = false;
        listState.error = null;

        renderPage();

        expect(screen.getByText('No meeting rooms yet')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps ended meetings out of the active tab', async () => {
        listState.data = [
            {
                id: 'meeting-active',
                name: 'Active meeting',
                status: 'active',
                agenda: 'Still running',
                created_at: '2026-11-01T10:00:00Z',
                total_cost: 0,
            },
            {
                id: 'meeting-ended',
                name: 'Ended meeting',
                status: 'ended',
                agenda: 'Already closed',
                created_at: '2026-10-01T10:00:00Z',
                total_cost: 0,
            },
        ];
        listState.isLoading = false;
        listState.isError = false;
        listState.error = null;

        renderPage();

        expect(screen.getByText('Active meeting')).toBeInTheDocument();
        expect(screen.queryByText('Ended meeting')).not.toBeInTheDocument();

        const endedTab = screen.getByRole('tab', { name: /Ended 1/ });
        fireEvent.mouseDown(endedTab);
        fireEvent.click(endedTab);

        expect(await screen.findByText('Ended meeting')).toBeInTheDocument();
    });

    it('reports a failed archive instead of dismissing it as success', async () => {
        listState.data = [
            {
                id: 'meeting-1',
                name: 'Existing meeting',
                status: 'active',
                agenda: 'Keep working',
                created_at: '2026-11-01T10:00:00Z',
                total_cost: 0,
            },
        ];
        listState.isLoading = false;
        listState.isError = false;
        listState.error = null;
        mutate.mockImplementation(
            (_meetingId: string, options: { onError?: (error: Error) => void; onSettled?: () => void }) => {
                options.onError?.(new ApiError('http', 409, 'Meeting is closing'));
                options.onSettled?.();
            }
        );

        renderPage();

        fireEvent.pointerDown(
            screen.getByRole('button', { name: 'Actions for Existing meeting' }),
            { button: 0 }
        );
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));

        expect(await screen.findByText(
            'This meeting is still closing. Archive it after the close finishes.'
        )).toBeInTheDocument();
        expect(screen.getByText('Existing meeting')).toBeInTheDocument();
        expect(refetch).toHaveBeenCalled();
    });

    it('keeps the delete confirmation open when deletion fails', async () => {
        listState.data = [
            {
                id: 'meeting-1',
                name: 'Existing meeting',
                status: 'active',
                agenda: 'Keep working',
                created_at: '2026-11-01T10:00:00Z',
                total_cost: 0,
            },
        ];
        listState.isLoading = false;
        listState.isError = false;
        listState.error = null;
        mutate.mockImplementation(
            (_meetingId: string, options: { onError?: (error: Error) => void; onSettled?: () => void }) => {
                options.onError?.(
                    new ApiError('http', 503, 'Knowledge cleanup unavailable')
                );
                options.onSettled?.();
            }
        );

        renderPage();

        fireEvent.pointerDown(
            screen.getByRole('button', { name: 'Actions for Existing meeting' }),
            { button: 0 }
        );
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        expect(
            await within(dialog).findByText(
                'The meeting was not deleted because its knowledge files could not be cleaned up. Try again.'
            )
        ).toBeInTheDocument();
        expect(screen.getByText('Delete Meeting?')).toBeInTheDocument();
    });
});
