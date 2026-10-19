// @vitest-environment happy-dom
/**
 * Regression: the meeting room must never render a stale meeting under a
 * mismatched route id. Navigating from meeting A to meeting B while B is still
 * loading used to render A's content (plus A's chats, documents, and schedule)
 * beneath B's URL, so any immediate action hit the wrong meeting.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    useParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useParams: mocks.useParams,
}));

vi.mock('@/lib/api', () => ({
    api: {},
    default: {},
}));

// The room's side tabs fetch their own data on mount; the gate under test is
// in the route shell, so stub the children.
vi.mock('@/components/chat/RosterTab', () => ({
    RosterTab: () => <div data-testid="roster-tab" />,
}));
vi.mock('@/components/chat/SharedDocumentsTab', () => ({
    SharedDocumentsTab: () => <div data-testid="documents-tab" />,
}));
vi.mock('@/components/chat/SummaryTab', () => ({
    SummaryTab: () => <div data-testid="summary-tab" />,
}));

import { useMeetingStore } from '@/stores/meetingStore';
import MeetingRoomPage from '@/app/meetings/[id]/page';

function makeMeeting(id: string) {
    return {
        id,
        name: `Meeting ${id}`,
        participants: [],
        messages: [],
        total_cost: 0,
    } as unknown as Parameters<typeof useMeetingStore.setState>[0]['currentMeeting'];
}

beforeEach(() => {
    vi.clearAllMocks();
    useMeetingStore.setState({
        currentMeeting: null,
        isLoading: false,
        error: null,
        activeTurnParticipantId: null,
        streamingMessage: null,
        loadOperation: null,
        turnOperation: null,
    });
});

describe('meeting room route gate', () => {
    it('shows a loader instead of stale meeting content while the route id differs', () => {
        mocks.useParams.mockReturnValue({ id: 'route-b' });

        act(() => {
            useMeetingStore.setState({
                currentMeeting: makeMeeting('route-a'),
                isLoading: true,
            });
        });

        render(<MeetingRoomPage />);

        expect(screen.queryByText('Meeting route-a')).toBeNull();
        expect(screen.queryByTestId('roster-tab')).toBeNull();
        expect(screen.queryByText('Who speaks next?')).toBeNull();
    });

    it('renders the room once the presented meeting matches the route', () => {
        mocks.useParams.mockReturnValue({ id: 'route-b' });

        act(() => {
            useMeetingStore.setState({ currentMeeting: makeMeeting('route-b') });
        });

        render(<MeetingRoomPage />);

        expect(screen.getByText('Meeting route-b')).toBeInTheDocument();
        expect(screen.getByText('Who speaks next?')).toBeInTheDocument();
    });
});
