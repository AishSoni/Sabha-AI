// @vitest-environment happy-dom
/**
 * Route gate (spec-10): the route is a thin shell. It passes the URL identity
 * to the feature-owned MeetingRoom and renders nothing else.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    useParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useParams: mocks.useParams,
}));

vi.mock('@/features/meetings', async () => {
    const actual = await vi.importActual<typeof import('@/features/meetings')>(
        '@/features/meetings'
    );
    return {
        ...actual,
        MeetingRoom: ({ meetingId }: { meetingId: string }) => (
            <div data-testid="meeting-room">room:{meetingId}</div>
        ),
    };
});

import MeetingRoomPage from '@/app/(operator)/meetings/[id]/page';

describe('meeting room route shell', () => {
    it('passes the route id to the canonical MeetingRoom', () => {
        mocks.useParams.mockReturnValue({ id: 'meeting-a' });
        render(<MeetingRoomPage />);
        expect(screen.getByTestId('meeting-room')).toHaveTextContent('room:meeting-a');
    });
});
