// Queue UI: FIFO positions, edit/save/remove against revisions, and conflict
// behavior that preserves the user's unsaved draft for retry or copy.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueuePanel } from '@/components/chat/QueuePanel';
import { useMeetingStore } from '@/stores/meetingStore';
import { api, ApiError, type QueueEntry } from '@/lib/api';
import { resetMeetingStore } from '@/test/reset';

function meeting() {
  return {
    id: 'm1',
    name: 'Meeting m1',
    agenda: '',
    status: 'active',
    participants: [],
    messages: [],
    total_cost: 0,
    created_at: new Date().toISOString(),
  };
}

function entry(entryId: string, content: string, revision = 1): QueueEntry {
  return { entryId, meetingId: 'm1', position: null, content, revision, state: 'pending', messageId: null };
}

function seed(entries: QueueEntry[]) {
  useMeetingStore.setState({
    currentMeeting: meeting() as never,
    selectedMeetingId: 'm1',
    queueEntries: entries,
    queueStatus: 'idle',
    queueError: null,
  } as never);
}

beforeEach(() => {
  resetMeetingStore();
  vi.restoreAllMocks();
});

describe('QueuePanel', () => {
  it('lists pending entries in FIFO order with positions', async () => {
    vi.spyOn(api, 'getQueue').mockResolvedValue([entry('e1', 'first'), entry('e2', 'second')]);
    seed([]);
    render(<QueuePanel />);
    expect(await screen.findByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(screen.getByLabelText('Position 1 of 2')).toHaveTextContent('#1');
    expect(screen.getByLabelText('Position 2 of 2')).toHaveTextContent('#2');
  });

  it('saves an edit against the entry revision', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getQueue').mockResolvedValue([entry('e1', 'first')]);
    const edit = vi.spyOn(api, 'editQueueEntry').mockResolvedValue(entry('e1', 'edited'));
    seed([]);
    render(<QueuePanel />);
    await user.click(await screen.findByLabelText('Edit pending message 1'));
    await user.clear(screen.getByLabelText('Edit pending message 1'));
    await user.type(screen.getByLabelText('Edit pending message 1'), 'edited');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(edit).toHaveBeenCalledWith('m1', 'e1', 'edited', 1));
    expect(await screen.findByText('edited')).toBeInTheDocument();
  });

  it('keeps the unsaved draft when the server reports a revision conflict', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getQueue').mockResolvedValue([entry('e1', 'first')]);
    vi.spyOn(api, 'editQueueEntry').mockRejectedValue(new ApiError(409, 'revision_conflict', 'stale'));
    seed([]);
    render(<QueuePanel />);
    await user.click(await screen.findByLabelText('Edit pending message 1'));
    const box = screen.getByLabelText('Edit pending message 1');
    await user.clear(box);
    await user.type(box, 'my unsaved wording');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // Draft is preserved for retry/copy instead of being overwritten.
    expect(await screen.findByText(/draft is preserved/)).toBeInTheDocument();
    expect(screen.getByLabelText('Edit pending message 1')).toHaveValue('my unsaved wording');
  });

  it('rejects empty and oversized edits before any request', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getQueue').mockResolvedValue([entry('e1', 'first')]);
    const edit = vi.spyOn(api, 'editQueueEntry');
    seed([]);
    render(<QueuePanel />);
    await user.click(await screen.findByLabelText('Edit pending message 1'));
    const box = screen.getByLabelText('Edit pending message 1');
    await user.clear(box);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Message cannot be empty.')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'x'.repeat(4001) } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/too long/)).toBeInTheDocument();
    expect(edit).not.toHaveBeenCalled();
  });
});
