// Summary tab reads authoritative server state only: system transcript
// messages plus the ending-attempt result. Ended/archived meetings are
// read-only and the view never fabricates a summary locally.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMeetingStore } from '@/stores/meetingStore';
import { api } from '@/lib/api';
import { resetMeetingStore } from '@/test/reset';
import { SummaryTab } from '@/components/chat/SummaryTab';

vi.mock('@/lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/api')>();
  return { ...orig, api: { ...orig.api } };
});

function seedMeeting(status: 'active' | 'ended' | 'archived' = 'active') {
  useMeetingStore.setState({
    currentMeeting: {
      id: 'm1',
      user_id: null,
      name: 'M',
      agenda: '',
      status,
      total_cost: 0,
      created_at: new Date().toISOString(),
      participants: [],
      messages: [
        {
          id: 'sys1',
          meeting_id: 'm1',
          sender_type: 'system',
          sender_id: null,
          sender_name: 'System',
          content: 'Checkpoint: scope agreed.',
          citations: [],
          tool_artifacts: null,
          thinking_content: null,
          estimated_cost: 0,
          created_at: new Date().toISOString(),
        },
        {
          id: 'u1',
          meeting_id: 'm1',
          sender_type: 'user',
          sender_id: null,
          sender_name: 'You',
          content: 'Hello',
          citations: [],
          tool_artifacts: null,
          thinking_content: null,
          estimated_cost: 0,
          created_at: new Date().toISOString(),
        },
      ],
    },
  } as never);
}

beforeEach(() => {
  resetMeetingStore();
  vi.restoreAllMocks();
});

describe('summary tab authoritative state', () => {
  it('lists system transcript entries and never fabricates summaries', () => {
    seedMeeting('active');
    render(<SummaryTab />);

    expect(screen.getByText('Checkpoint: scope agreed.')).toBeDefined();
    // User chat is not a summary.
    expect(screen.queryByText('Hello')).toBeNull();
    // No fabricated generation control remains.
    expect(screen.queryByText(/generate summary #/i)).toBeNull();
  });

  it('ended meetings are read-only with no end controls', () => {
    seedMeeting('ended');
    render(<SummaryTab />);

    expect(screen.getByText(/meeting ended/i)).toBeDefined();
    expect(screen.getByText(/read-only and will never reopen it/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /end this meeting/i })).toBeNull();
  });

  it('refresh reloads the transcript from the server', async () => {
    seedMeeting('active');
    const getMeeting = vi
      .spyOn(api, 'getMeeting')
      .mockResolvedValue(useMeetingStore.getState().currentMeeting as never);

    render(<SummaryTab />);
    await userEvent.click(
      screen.getByRole('button', { name: /reload summary state from server/i }),
    );
    await waitFor(() => expect(getMeeting).toHaveBeenCalledWith('m1'));
  });
});
