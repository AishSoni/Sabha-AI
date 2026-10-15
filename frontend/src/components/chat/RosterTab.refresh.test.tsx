// Persona refresh workflow: preview diff, explicit apply, conflict reload.
// A stale/busy conflict must discard the preview so the next preview loads
// fresh revisions — it must never look applied.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMeetingStore } from '@/stores/meetingStore';
import { ApiError, api } from '@/lib/api';
import { resetMeetingStore } from '@/test/reset';
import { RosterTab } from '@/components/chat/RosterTab';

vi.mock('@/lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...orig,
    api: { ...orig.api },
    participantsApi: {
      refreshPreview: vi.fn(),
      refreshParticipant: vi.fn(),
    },
  };
});

const { participantsApi } = await import('@/lib/api');
const previewMock = vi.mocked(participantsApi.refreshPreview);
const applyMock = vi.mocked(participantsApi.refreshParticipant);

function seedMeeting() {
  useMeetingStore.setState({
    currentMeeting: {
      id: 'm1',
      user_id: null,
      name: 'M',
      agenda: '',
      status: 'active',
      total_cost: 0,
      created_at: new Date().toISOString(),
      participants: [
        {
          id: 'p1',
          meeting_id: 'm1',
          name: 'The Investor',
          role: 'investor',
          system_prompt: 'prompt',
          provider_config: { provider: 'gemini', model: 'm', temperature: 0.5 },
          color: '#fff',
          created_at: new Date().toISOString(),
        },
      ],
      messages: [],
    },
  } as never);
}

beforeEach(() => {
  resetMeetingStore();
  vi.restoreAllMocks();
  seedMeeting();
});

describe('persona refresh workflow', () => {
  it('previews a field diff and applies explicitly', async () => {
    previewMock.mockResolvedValue({
      changed: true,
      diff: { model: { from: 'old-model', to: 'new-model' } },
    });
    applyMock.mockResolvedValue({ id: 'p1' } as never);
    const getMeeting = vi
      .spyOn(api, 'getMeeting')
      .mockResolvedValue(useMeetingStore.getState().currentMeeting as never);
    vi.spyOn(api, 'getDisagreements').mockResolvedValue([]);
    vi.spyOn(api, 'getConsensus').mockResolvedValue([]);
    vi.spyOn(api, 'getContextStats').mockResolvedValue({} as never);

    render(<RosterTab />);
    await userEvent.click(screen.getByRole('button', { name: /persona refresh for the investor/i }));
    await userEvent.click(screen.getByRole('button', { name: /preview refresh for the investor/i }));

    await waitFor(() => expect(previewMock).toHaveBeenCalledWith('p1'));
    expect(screen.getByText('model')).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /apply refresh for the investor/i }));
    await waitFor(() => expect(applyMock).toHaveBeenCalledWith('p1'));
    expect(getMeeting).toHaveBeenCalledWith('m1');
    await waitFor(() =>
      expect(screen.getByText(/showing the server-confirmed snapshot/i)).toBeDefined(),
    );
  });

  it('a busy/stale conflict discards the preview and reports the server reason', async () => {
    previewMock.mockResolvedValue({
      changed: true,
      diff: { temperature: { from: 0.5, to: 0.7 } },
    });
    applyMock.mockRejectedValue(new ApiError(409, 'turn_in_progress', 'busy', false));

    render(<RosterTab />);
    await userEvent.click(screen.getByRole('button', { name: /persona refresh for the investor/i }));
    await userEvent.click(screen.getByRole('button', { name: /preview refresh for the investor/i }));
    await waitFor(() => expect(previewMock).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: /apply refresh for the investor/i }));
    await waitFor(() =>
      expect(screen.getByText(/refresh not applied: turn_in_progress/i)).toBeDefined(),
    );
    // Preview discarded: the diff is gone until the user previews again.
    expect(screen.queryByText('temperature')).toBeNull();
    expect(applyMock).toHaveBeenCalledTimes(1);
  });

  it('reports an unchanged snapshot without an apply action', async () => {
    previewMock.mockResolvedValue({ changed: false, diff: {} });

    render(<RosterTab />);
    await userEvent.click(screen.getByRole('button', { name: /persona refresh for the investor/i }));
    await userEvent.click(screen.getByRole('button', { name: /preview refresh for the investor/i }));

    await waitFor(() => expect(screen.getByText(/already up to date/i)).toBeDefined());
    expect(screen.queryByRole('button', { name: /apply refresh for the investor/i })).toBeNull();
  });
});
