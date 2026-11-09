import { fireEvent, render, screen } from '@testing-library/react';
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
}));

import MeetingSpacePage from './page';

function renderPage() {
    return render(<MeetingSpacePage />);
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
});
