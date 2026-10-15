// Keyboard and motion accessibility for core meeting controls: queue edit
// focus, Escape cancellation, and a reduced-motion scroll path that never
// forces animated delays.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueuePanel } from '@/components/chat/QueuePanel';
import { useMeetingStore } from '@/stores/meetingStore';
import { api, type QueueEntry } from '@/lib/api';
import { preferredScrollBehavior } from '@/lib/motion';
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

function entry(entryId: string, content: string): QueueEntry {
  return { entryId, meetingId: 'm1', position: null, content, revision: 1, state: 'pending', messageId: null };
}

beforeEach(() => {
  resetMeetingStore();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches, media: '(prefers-reduced-motion: reduce)' }) as never));
}

describe('reduced-motion scroll path', () => {
  it('uses an instant scroll when reduced motion is preferred', () => {
    stubMotion(true);
    expect(preferredScrollBehavior()).toBe('auto');
  });

  it('uses smooth scrolling otherwise', () => {
    stubMotion(false);
    expect(preferredScrollBehavior()).toBe('smooth');
  });
});

describe('QueuePanel keyboard access', () => {
  it('moves focus into the editor, cancels on Escape, and names every control', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getQueue').mockResolvedValue([entry('e1', 'first')]);
    useMeetingStore.setState({
      currentMeeting: meeting() as never,
      selectedMeetingId: 'm1',
      queueEntries: [entry('e1', 'first')],
      queueStatus: 'idle',
      queueError: null,
    } as never);
    render(<QueuePanel />);

    expect(screen.getByLabelText('Edit pending message 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove pending message 1')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Edit pending message 1'));
    const box = screen.getByLabelText('Edit pending message 1');
    expect(document.activeElement).toBe(box);

    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByLabelText('Edit pending message 1', { selector: 'textarea' })).not.toBeInTheDocument();
  });
});
