import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_ANCHOR_ROUTES, mergeGuideSteps, routeForAnchor } from './demoGuideSteps';
import type { DemoGuidePayload } from './demoGuideApi';
import { mockHttp, restoreHttpMocks } from '@/test/http';
import { useDemoGuideStore } from '@/stores/demoGuideStore';

function guidePayload(): DemoGuidePayload {
  const journeyActions = [
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
  ];
  const journey: DemoGuidePayload['journey'] = {};
  journeyActions.forEach((action, i) => {
    journey[`J0${i}`] = { action, why: `why-${action}`, tech: `tech-${action}` };
  });
  const ui: DemoGuidePayload['ui'] = {};
  for (let i = 0; i < 9; i += 1) {
    ui[`UI0${i}`] = { anchor: `anchor_${i}`, action: `ui_action_${i}`, why: `ui why-${i}` };
  }
  return {
    scenario_id: 'indian-corporate-bond-review',
    scenario_revision: 1,
    content_version: 1,
    disclosure: 'recorded analysis · Not financial advice',
    instrument: { isin: 'INE001A07RW5', name: 'demo bond' },
    snapshot_date: '2020-07-31',
    journey,
    ui,
    specialists: [
      { specialist_id: 'credit-business', title: 'Credit & Business specialist', remit: 'r' },
      { specialist_id: 'structure-downside', title: 'Bond Structure & Downside specialist', remit: 'r' },
      { specialist_id: 'treasury-market', title: 'Treasury & Market specialist', remit: 'r' },
    ],
    recorded_analysis: true,
    approval_status: 'pending-d01',
  };
}

beforeEach(() => {
  sessionStorage.clear();
  useDemoGuideStore.getState().exit();
  useDemoGuideStore.setState({
    status: 'idle',
    steps: [],
    journeyCompleted: [],
    uiCompleted: [],
    active: false,
    paused: false,
    exited: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreHttpMocks();
  sessionStorage.clear();
});

describe('demo guide steps merge', () => {
  it('orders UI and journey steps from the package and maps journey action ids', () => {
    const steps = mergeGuideSteps(guidePayload());
    expect(steps.map((s) => s.key)).toEqual([
      'UI00',
      'J00',
      'UI01',
      'UI02',
      'UI03',
      'UI04',
      'UI05',
      'J01',
      'J02',
      'J03',
      'J04',
      'J05',
      'J06',
      'J07',
      'UI06',
      'J08',
      'UI07',
      'J09',
      'UI08',
    ]);
    const submit = steps.find((s) => s.key === 'J02');
    expect(submit?.journeyActionId).toBe('submit_bond_question');
    expect(steps[0].anchor).toBe('anchor_0');
  });

  it('exposes frontend-owned anchor -> route mapping only', () => {
    expect(routeForAnchor('settings.root')).toBe('/settings');
    expect(routeForAnchor('not-from-db')).toBeNull();
    expect(Object.keys(DEMO_ANCHOR_ROUTES)).not.toContain('/settings');
  });
});

describe('demo guide store', () => {
  it('advances a client-observed journey action via the server and resyncs', async () => {
    const payload = guidePayload();
    let postedProgress = false;
    const http = mockHttp((config) => {
      const url = config.url ?? '';
      if (url.endsWith('/v2/demo/guide')) return { url: /\/v2\/demo\/guide$/, data: payload };
      if (url.endsWith('/v2/demo/journey-progress')) {
        postedProgress = true;
        return { url: /\/v2\/demo\/journey-progress$/, data: { ok: true } };
      }
      if (url.endsWith('/v2/demo/journey-state')) {
        const completed = postedProgress
          ? ['start_walkthrough', 'inspect_board']
          : ['start_walkthrough'];
        return {
          url: /\/v2\/demo\/journey-state$/,
          data: {
            session: {
              session_id: 's-1',
              generation: 1,
              scenario_id: 'indian-corporate-bond-review',
              action_count: 1,
              expires_at: '2099-01-01',
            },
            progress: {
              stage: completed.at(-1) ?? null,
              completed,
              failed: [],
              meeting_id: null,
              specialists: [],
              turn_reference: null,
            },
            instrument: { isin: 'INE001A07RW5', name: 'demo bond' },
            disclosure: 'd',
          },
        };
      }
      return undefined;
    });

    sessionStorage.setItem('sabha.demo.sessionToken', 'cred-token-1');
    await useDemoGuideStore.getState().hydrate();
    expect(useDemoGuideStore.getState().status).toBe('ready');
    // Pointer rests on the first incomplete step (UI00 intro) even when
    // earlier journey actions completed on prior visits.
    expect(useDemoGuideStore.getState().steps[
      useDemoGuideStore.getState().currentIndex
    ]?.key).toBe('UI00');

    // Client-observed step posts journey-progress, then resyncs from server.
    await useDemoGuideStore.getState().markJourneyAction('inspect_board');
    expect(http.calls.some((c) => (c.url ?? '').endsWith('/journey-progress'))).toBe(true);
    // Demo routes carry the raw session credential, not the demo owner alias.
    expect(http.lastCall().headers?.Authorization).toBe('Bearer cred-token-1');

    const state = useDemoGuideStore.getState();
    expect(state.journeyCompleted).toContain('inspect_board');
    // Walk the intro UI step; the pointer then lands on the next pending step.
    useDemoGuideStore.getState().next();
    const pending = useDemoGuideStore.getState().steps[
      useDemoGuideStore.getState().currentIndex
    ];
    expect(pending?.key).toBe('UI01');
  });

  it('does not mark progress UI steps as journey actions and keeps them local', async () => {
    const payload = guidePayload();
    mockHttp({
      url: /\/v2\/demo\/guide$/,
      data: payload,
    });
    await useDemoGuideStore.getState().hydrate();
    useDemoGuideStore.getState().markUiObserved('UI01');
    expect(useDemoGuideStore.getState().uiCompleted).toContain('UI01');
    expect(sessionStorage.getItem('sabha.demo.guideUi')).toContain('UI01');
  });
});
