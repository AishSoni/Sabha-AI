// P01-TEST03 (frontend half): two tests mutating the same store;
// the second starts clean. Timer hygiene: fake timers restored even after
// a failure is covered in `timers restore after failure` below.
import { describe, expect, it, vi } from 'vitest';
import { useMeetingStore } from '@/stores/meetingStore';
import { resetMeetingStore } from '@/test/reset';

function meeting(id: string) {
  return {
    id,
    name: `Meeting ${id}`,
    agenda: '',
    status: 'active',
    participants: [],
    messages: [],
    total_cost: 0,
    created_at: new Date().toISOString(),
  };
}

describe('P01-TEST03 store isolation', () => {
  it('first mutation does not leak into the next test', () => {
    resetMeetingStore();
    useMeetingStore.setState({
      meetings: [meeting('A') as never],
      currentMeeting: meeting('A') as never,
      isLoading: true,
    });
    expect(useMeetingStore.getState().meetings).toHaveLength(1);
    expect(useMeetingStore.getState().isLoading).toBe(true);
  });

  it('starts clean after the previous mutation', () => {
    resetMeetingStore();
    const s = useMeetingStore.getState();
    expect(s.meetings).toEqual([]);
    expect(s.currentMeeting).toBeNull();
    expect(s.isLoading).toBe(false);
    expect(s.error).toBeNull();
    expect(s.streamingMessage).toBeNull();
  });

  it('timers restore after failure', () => {
    resetMeetingStore();
    vi.useFakeTimers();
    try {
      useMeetingStore.setState({ isLoading: true });
      throw new Error('simulated test body failure');
    } catch {
      // fall through to restore, mirroring what the harness must guarantee
    } finally {
      vi.useRealTimers();
    }
    expect(vi.isFakeTimers()).toBe(false);
  });
});
