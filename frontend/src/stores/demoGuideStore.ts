// Demo guide state: single route-persistent walkthrough overlay.
// Server-authoritative journey progress is the source of truth; UI-observed
// steps (visits) persist client-side only. Never advances a journey action
// without a real application event.

import { create } from 'zustand';
import {
  attachDemoMeeting,
  getDemoGuide,
  getDemoJourneyState,
  loadDemoCredential,
  loadDemoMeetingId,
  loadGuideUiCompleted,
  markGuideUiCompleted,
  postDemoJourneyProgress,
} from '../lib/demoGuideApi';
import { mergeGuideSteps, type DemoGuideStepView } from '../lib/demoGuideSteps';

export type DemoGuideStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

interface DemoGuideState {
  steps: DemoGuideStepView[];
  currentIndex: number;
  uiCompleted: string[];
  journeyCompleted: string[];
  hasSession: boolean;
  paused: boolean;
  exited: boolean;
  active: boolean;
  status: DemoGuideStatus;
  instrumentIsin: string | null;
  disclosure: string | null;
  hydrate: () => Promise<void>;
  next: () => void;
  back: () => void;
  goTo: (index: number) => void;
  pause: () => void;
  resume: () => void;
  exit: () => void;
  activate: () => void;
  /** After a session POST: records + applies the start_walkthrough journey step. */
  startWalkthrough: (credential?: string) => Promise<void>;
  /** Guide-driven lobby: attach + pin the real demo meeting, then route. */
  createMeeting: (onPinned: (meetingId: string) => void) => Promise<void>;
  /** Server-acknowledged journey action completion (turns/queue steps). */
  markJourneyAction: (actionId: string) => Promise<void>;
  /** UI-observed step completion (visits etc.). */
  markUiObserved: (key: string) => void;
}

function currentIndexFor(steps: DemoGuideStepView[], uiCompleted: string[], journeyCompleted: string[]): number {
  let index = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step.journeyActionId) {
      if (journeyCompleted.includes(step.journeyActionId)) index = i + 1;
      else break;
    } else {
      if (uiCompleted.includes(step.key)) index = i + 1;
      else break;
    }
  }
  return Math.min(index, steps.length);
}

const clampIndex = (index: number, length: number) => Math.max(0, Math.min(index, Math.max(length - 1, 0)));

export const useDemoGuideStore = create<DemoGuideState>((set, get) => ({  steps: [],
  currentIndex: 0,
  uiCompleted: [],
  journeyCompleted: [],
  hasSession: false,
  paused: false,
  exited: false,
  active: false,
  status: 'idle',
  instrumentIsin: null,
  disclosure: null,

  hydrate: async () => {
    if (get().status === 'loading') return;
    const uiCompleted = loadGuideUiCompleted();
    set({ status: 'loading', uiCompleted });
    try {
      const guide = await getDemoGuide();
      const steps = mergeGuideSteps(guide);
      set({
        steps,
        instrumentIsin: guide.instrument?.isin ?? null,
        disclosure: guide.disclosure ?? null,
      });
    } catch {
      set({ status: 'unavailable' });
      return;
    }
    const credential = loadDemoCredential();
    const meetingId = loadDemoMeetingId();
    let journeyCompleted: string[] = [];
    const hasSession = Boolean(credential);
    if (credential) {
      try {
        const state = await getDemoJourneyState();
        journeyCompleted = state.progress?.completed ?? [];
      } catch {
        /* expired or not started: walkthrough still renders from step 0 */
      }
    }
    const { steps: s, uiCompleted: ui, active } = get();
    const currentIndex = currentIndexFor(s || [], ui, journeyCompleted);
    set({
      journeyCompleted,
      hasSession,
      active: active || Boolean(meetingId) || hasSession,
      status: 'ready',
      currentIndex: clampIndex(currentIndex, s.length),
    });
  },

  next: () => {
    const { steps, currentIndex } = get();
    if (steps.length === 0) return;
    const nextIndex = clampIndex(currentIndex + 1, steps.length);
    set({ currentIndex: nextIndex, paused: false });
    const step = get().steps[nextIndex];
    if (step && !step.journeyActionId && !get().uiCompleted.includes(step.key)) {
      markGuideUiCompleted(step.key);
      set({ uiCompleted: [...get().uiCompleted, step.key] });
    }
  },

  back: () => {
    const { steps, currentIndex } = get();
    if (steps.length === 0) return;
    set({ currentIndex: clampIndex(currentIndex - 1, steps.length) });
  },

  goTo: index => {
    const { steps } = get();
    set({ currentIndex: clampIndex(index, steps.length) });
  },

  pause: () => set({ paused: true }),
  resume: () => set({ paused: false }),
  activate: () => set({ active: true, exited: false }),

  exit: () => {
    try {
      sessionStorage.removeItem('sabha.demo.sessionToken');
      sessionStorage.removeItem('sabha.demo.meetingId');
      sessionStorage.removeItem('sabha.demo.guideUi');
    } catch {
      /* ignore */
    }
    set({
      active: false,
      paused: false,
      exited: true,
      steps: [],
      currentIndex: 0,
      uiCompleted: [],
      journeyCompleted: [],
      hasSession: false,
      status: 'idle',
    });
  },

  startWalkthrough: async () => {
    set({ hasSession: true });
    try {
      await postDemoJourneyProgress({ actionId: 'start_walkthrough' });
      const { steps, uiCompleted } = get();
      const journeyCompleted = [...get().journeyCompleted, 'start_walkthrough'];
      set({
        journeyCompleted,
        currentIndex: clampIndex(currentIndexFor(steps, uiCompleted, journeyCompleted), steps.length),
        status: 'ready',
        active: true,
        exited: false,
      });
    } catch {
      /* order enforcement may reject duplicates; hydrate resyncs on next mount */
      await get().hydrate();
    }
  },

  createMeeting: async onPinned => {
    try {
      const attach = await attachDemoMeeting();
      const meetingId = attach.meeting.meeting_id;
      try {
        sessionStorage.setItem('sabha.demo.meetingId', meetingId);
      } catch {
        /* ignore */
      }
      get().markUiObserved('UI04');
      await get().hydrate();
      onPinned(meetingId);
    } catch {
      /* surface refusal honestly; guide stays on the current step */
    }
  },

  markJourneyAction: async actionId => {
    const { steps, journeyCompleted } = get();
    if (journeyCompleted.includes(actionId)) return;
    try {
      if (actionId !== 'explore_followup') {
        // Server applies ask_*/end_* steps itself after a successful turn.
        const autoServerSteps = ['explore_followup'];
        if (!autoServerSteps.includes(actionId) && !/^(ask_|submit_|end_)/.test(actionId)) {
          await postDemoJourneyProgress({ actionId });
        }
      }
    } catch {
      /* out-of-order submissions resync via journey-state below */
    }
    try {
      const state = await getDemoJourneyState();
      const serverCompleted = state.progress?.completed ?? [];
      const merged = Array.from(new Set([...serverCompleted, ...journeyCompleted]));
      set({
        journeyCompleted: merged,
        currentIndex: clampIndex(
          currentIndexFor(steps, get().uiCompleted, merged),
          steps.length,
        ),
      });
    } catch {
      /* keep local pointer; next hydrate retries */
    }
  },

  markUiObserved: key => {
    const { uiCompleted, steps } = get();
    if (uiCompleted.includes(key)) return;
    const merged = [...uiCompleted, key];
    markGuideUiCompleted(key);
    set({
      uiCompleted: merged,
      currentIndex: clampIndex(currentIndexFor(steps, merged, get().journeyCompleted), steps.length),
    });
  },
}));
