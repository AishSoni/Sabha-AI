// B-09 regression (fixed by Phase 07): a delayed load/final event for a
// previously selected meeting must not overwrite the newly selected one.
// Correct behavior: stale responses for meeting A arriving after selecting
// B leave B's visible data untouched. Extended race coverage lives in
// meetingStore.races.test.ts (send/stats/streaming).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useMeetingStore } from '@/stores/meetingStore';
import { api } from '@/lib/api';
import { resetMeetingStore } from '@/test/reset';

vi.mock('@/lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/api')>();
  return { ...orig, api: { ...orig.api } };
});

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

describe('B-09 stale load must not overwrite newly selected meeting', () => {
  beforeEach(() => {
    resetMeetingStore();
    vi.restoreAllMocks();
  });

  it('delayed A response after selecting B keeps B visible', async () => {
    let resolveA!: (v: unknown) => void;
    const gateA = new Promise((resolve) => {
      resolveA = resolve;
    });
    vi.spyOn(api, 'getMeeting').mockImplementation(async (id: string) => {
      if (id === 'A') await gateA;
      return meeting(id) as never;
    });
    vi.spyOn(api, 'getDisagreements').mockResolvedValue([]);
    vi.spyOn(api, 'getConsensus').mockResolvedValue([]);
    vi.spyOn(api, 'getContextStats').mockResolvedValue({} as never);

    const loadA = useMeetingStore.getState().loadMeeting('A');
    // User selects B while A is still in flight.
    await useMeetingStore.getState().loadMeeting('B');
    expect(useMeetingStore.getState().currentMeeting?.id).toBe('B');
    // A's delayed response arrives last.
    resolveA(undefined);
    await loadA;

    // Correct behavior: B stays visible; stale A is discarded.
    expect(useMeetingStore.getState().currentMeeting?.id).toBe('B');
  });
});
