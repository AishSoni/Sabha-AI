// Phase 07 red reproductions (B-09): stale async results for a previously
// selected meeting must not overwrite the newly selected meeting.
// These assert correct behavior and FAIL against the pre-fix store.
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
    participants: [{ id: `p-${id}`, name: `AI ${id}`, role: 'analyst', system_prompt: '', provider_config: { provider: 'x', model: 'y', temperature: 0 }, color: '#fff', meeting_id: id, created_at: new Date().toISOString() }],
    messages: [],
    total_cost: 0,
    created_at: new Date().toISOString(),
  };
}

function stats(pct: number) {
  return { current_tokens: pct, max_tokens: 100, usage_percent: pct, message_count: 0, participant_count: 0 };
}

describe('B-09 stale async results keep the newly selected meeting', () => {
  beforeEach(() => {
    resetMeetingStore();
    vi.restoreAllMocks();
  });

  it('delayed user-send for A does not append to B', async () => {
    let resolveA!: (v: unknown) => void;
    const gateA = new Promise((resolve) => { resolveA = resolve; });
    vi.spyOn(api, 'submitMessage').mockImplementation(async () => {
      await gateA;
      return { queued: false, message: { id: 'm-a', meeting_id: 'A', sender_type: 'user', sender_id: null, sender_name: 'You', content: 'hi A', citations: [], tool_artifacts: null, thinking_content: null, estimated_cost: 0, created_at: new Date().toISOString() } as never };
    });

    useMeetingStore.setState({ currentMeeting: meeting('A') as never, selectedMeetingId: 'A' });
    const sendA = useMeetingStore.getState().sendUserMessage('hi A');
    // User navigates to B while A's send is in flight.
    useMeetingStore.setState({ currentMeeting: meeting('B') as never, selectedMeetingId: 'B' });
    resolveA(undefined);
    await sendA;

    const current = useMeetingStore.getState().currentMeeting;
    expect(current?.id).toBe('B');
    expect(current?.messages ?? []).toHaveLength(0);
  });

  it('delayed context-stats for A do not overwrite B', async () => {
    let resolveA!: (v: unknown) => void;
    const gateA = new Promise((resolve) => { resolveA = resolve; });
    vi.spyOn(api, 'getContextStats').mockImplementation(async (id: string) => {
      if (id === 'A') await gateA;
      return stats(id === 'A' ? 11 : 22) as never;
    });

    useMeetingStore.setState({ currentMeeting: meeting('A') as never, selectedMeetingId: 'A' });
    const fetchA = useMeetingStore.getState().fetchContextStats();
    useMeetingStore.setState({ currentMeeting: meeting('B') as never, selectedMeetingId: 'B' });
    await useMeetingStore.getState().fetchContextStats();
    resolveA(undefined);
    await fetchA;

    expect(useMeetingStore.getState().currentMeeting?.id).toBe('B');
    expect(useMeetingStore.getState().contextStats?.usage_percent).toBe(22);
  });

  it('streaming completion for A does not overwrite B', async () => {
    let releaseDone!: () => void;
    const doneGate = new Promise<void>((resolve) => { releaseDone = resolve; });
    vi.spyOn(api, 'subscribeTurnEvents').mockImplementation(async ({ onEvent }) => {
      onEvent({ kind: 'text_delta', sequence: 1, meetingId: 'A', turnId: null, segmentId: null, invocationIndex: null, content: 'partial A', toolExecutionId: null, providerCallId: null, toolName: null, toolArgs: null, toolResult: null, toolOutcome: null, terminalKind: null, messageId: null, errorMessage: null, retryable: false, raw: {} });
      await doneGate;
      const terminal = { kind: 'terminal', sequence: 2, meetingId: 'A', turnId: null, segmentId: null, invocationIndex: null, content: null, toolExecutionId: null, providerCallId: null, toolName: null, toolArgs: null, toolResult: null, toolOutcome: null, terminalKind: 'completed', messageId: 'm-new', errorMessage: null, retryable: false, raw: {} } as const;
      onEvent(terminal as never);
      return { terminal: terminal as never, eofWithoutTerminal: false, aborted: false };
    });
    vi.spyOn(api, 'getMeeting').mockImplementation(async (id: string) => meeting(id) as never);
    vi.spyOn(api, 'getDisagreements').mockResolvedValue([]);
    vi.spyOn(api, 'getConsensus').mockResolvedValue([]);
    vi.spyOn(api, 'getContextStats').mockResolvedValue(stats(1) as never);
    vi.spyOn(api, 'getQueue').mockResolvedValue([]);

    useMeetingStore.setState({ currentMeeting: meeting('A') as never, selectedMeetingId: 'A' });
    const runA = useMeetingStore.getState().executeTurnStreaming('p-A');
    // Let the first text event apply, then navigate to B before done.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    useMeetingStore.setState({ currentMeeting: meeting('B') as never, selectedMeetingId: 'B' });
    releaseDone();
    await runA;

    expect(useMeetingStore.getState().currentMeeting?.id).toBe('B');
  });
});
