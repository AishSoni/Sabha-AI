// Bond journey state: generation-fenced, server-wins, resettable walkthrough.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BOND_CONTENT_REVISION,
  BOND_SCENARIO_ID,
  clearDemoToken,
  demoFetch,
  loadDemoToken,
  saveDemoToken,
  type DemoApiError,
} from './journeyClient';

export const JOURNEY_STEPS = [
  'start_walkthrough',
  'inspect_board',
  'submit_bond_question',
  'ask_credit_analysis',
  'ask_structure_downside',
  'queue_verification_question',
  'ask_treasury_analysis',
  'agree_verification_agenda',
  'end_walkthrough',
  'explore_followup',
] as const;

export interface JourneyTurn {
  action_id: string;
  final_text: string;
  specialist?: string | null;
  citations?: Array<{ source: string; title: string; snippet: string }>;
  votes?: Array<{ participant: string; vote: string }>;
  brief?: Record<string, unknown>;
}

interface JourneyState {
  phase: 'idle' | 'starting' | 'active' | 'failed';
  token: string | null;
  generation: number;
  meetingId: string | null;
  completed: string[];
  currentStep: string | null;
  turns: JourneyTurn[];
  queue: Array<{ entry_id: string; content: string; revision: number }>;
  error: string | null;
}

const INITIAL: JourneyState = {
  phase: 'idle',
  token: null,
  generation: 1,
  meetingId: null,
  completed: [],
  currentStep: null,
  turns: [],
  queue: [],
  error: null,
};

function errorText(error: unknown): string {
  const typed = error as Partial<DemoApiError>;
  if (typed?.code === 'stale_revision') {
    return 'This walkthrough moved on — refreshing from the server before retrying.';
  }
  if (typed?.code === 'demo_session_expired') {
    return 'The demo session expired. Start a fresh walkthrough to continue.';
  }
  if (typed?.code === 'demo_quota_exceeded') {
    return 'Session budget reached for this walkthrough. Reset to run it again.';
  }
  return (typed?.message as string) ?? 'Something went wrong. Retry this step.';
}

export function useBondJourney() {
  const [state, setState] = useState<JourneyState>(INITIAL);
  const requestId = useRef(0);

  const start = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, phase: 'starting', error: null }));
    try {
      const body = (await demoFetch('/sessions', '', {
        method: 'POST',
        payload: {
          scenario_id: BOND_SCENARIO_ID,
          scenario_revision: BOND_CONTENT_REVISION,
          idempotency_key: `walkthrough-${Date.now()}`,
        },
      })) as {
        credential: string;
        session: { generation: number };
        meeting: { meeting_id: string };
      };
      if (requestId.current !== id) return;
      saveDemoToken(body.credential);
      setState({
        phase: 'active',
        token: body.credential,
        generation: body.session.generation,
        meetingId: body.meeting.meeting_id,
        completed: [],
        currentStep: JOURNEY_STEPS[0],
        turns: [],
        queue: [],
        error: null,
      });
    } catch (error) {
      if (requestId.current !== id) return;
      setState((s) => ({ ...s, phase: 'failed', error: errorText(error) }));
    }
  }, []);

  const advance = useCallback(
    async (actionId: string, payload?: Record<string, unknown>) => {
      const { token, generation } = state;
      if (!token) return;
      const id = ++requestId.current;
      setState((s) => ({ ...s, error: null }));
      try {
        const body = (await demoFetch('/actions', token, {
          method: 'POST',
          payload: {
            action_id: actionId,
            scenario_revision: BOND_CONTENT_REVISION,
            expected_generation: generation,
            idempotency_key: `${actionId}-${generation}-${Date.now()}`,
            ...(payload ?? {}),
          },
        })) as {
          completed_action?: string;
          next_action?: string | null;
          turn?: JourneyTurn;
          queued_entry?: { entry_id: string; content: string; revision: number };
          session?: { generation: number };
        };
        if (requestId.current !== id) return;
        setState((s) => ({
          ...s,
          completed: body.completed_action
            ? [...s.completed, body.completed_action]
            : s.completed,
          currentStep: body.next_action ?? s.currentStep,
          turns: body.turn ? [...s.turns, body.turn] : s.turns,
          queue: body.queued_entry ? [...s.queue, body.queued_entry] : s.queue,
          generation: body.session?.generation ?? s.generation,
        }));
      } catch (error) {
        if (requestId.current !== id) return;
        setState((s) => ({ ...s, error: errorText(error) }));
      }
    },
    [state],
  );

  const refreshQueue = useCallback(async () => {
    const { token } = state;
    if (!token) return;
    const id = ++requestId.current;
    try {
      const body = (await demoFetch('/queue', token)) as {
        entries: Array<{ entry_id: string; content: string; revision: number }>;
      };
      if (requestId.current !== id) return;
      setState((s) => ({ ...s, queue: body.entries }));
    } catch (error) {
      if (requestId.current !== id) return;
      setState((s) => ({ ...s, error: errorText(error) }));
    }
  }, [state]);

  const editQueued = useCallback(
    async (entryId: string, content: string, revision: number) => {
      const { token } = state;
      if (!token) return false;
      try {
        await demoFetch(`/queue/${entryId}`, token, {
          method: 'PATCH',
          payload: { content, expected_revision: revision },
        });
        await refreshQueue();
        return true;
      } catch (error) {
        setState((s) => ({ ...s, error: errorText(error) }));
        return false;
      }
    },
    [state, refreshQueue],
  );

  const reset = useCallback(async () => {
    const { token, generation } = state;
    if (!token) return;
    const id = ++requestId.current;
    try {
      const body = (await demoFetch('/reset', token, {
        method: 'POST',
        payload: {
          expected_generation: generation,
          idempotency_key: `reset-${generation}-${Date.now()}`,
        },
      })) as { session: { generation: number }; meeting: { meeting_id: string } };
      if (requestId.current !== id) return;
      // Old generation's turns/queue are fenced: replaced, never merged.
      setState({
        phase: 'active',
        token,
        generation: body.session.generation,
        meetingId: body.meeting.meeting_id,
        completed: [],
        currentStep: JOURNEY_STEPS[0],
        turns: [],
        queue: [],
        error: null,
      });
    } catch (error) {
      if (requestId.current !== id) return;
      setState((s) => ({ ...s, error: errorText(error) }));
    }
  }, [state]);

  const leave = useCallback(() => {
    requestId.current += 1;
    clearDemoToken();
    setState(INITIAL);
  }, []);

  // Resume a stored token's server state on mount: server wins over storage.
  useEffect(() => {
    const stored = loadDemoToken();
    if (!stored) return;
    const id = ++requestId.current;
    demoFetch('/session', stored)
      .then((body) => {
        if (requestId.current !== id) return;
        const typed = body as {
          session: { generation: number };
          meeting: { meeting_id: string };
          progress: { completed: string[]; next: string | null };
        };
        setState({
          phase: 'active',
          token: stored,
          generation: typed.session.generation,
          meetingId: typed.meeting.meeting_id,
          completed: typed.progress.completed,
          currentStep: typed.progress.next,
          turns: [],
          queue: [],
          error: null,
        });
      })
      .catch(() => {
        if (requestId.current !== id) return;
        clearDemoToken();
      });
  }, []);

  return { state, start, advance, refreshQueue, editQueued, reset, leave };
}
