// Demo guide presentation assembly: merges the DB package's journey (J00-J09)
// and UI (UI00-UI08) step content into an ordered walkthrough. Content itself
// comes verbatim from the package; this module only decides sequencing and
// maps frontend-owned anchor keys to app routes.

import type {
  DemoGuidePayload,
} from './demoGuideApi';

/** Frontend-owned anchors -> app routes. DB content may reference the key, never the route. */
export const DEMO_ANCHOR_ROUTES: Record<string, string> = {
  'home.try-demo': '/',
  'settings.root': '/settings',
  'stacks.list-new': '/knowledge-stacks',
  'roster.list-new': '/roster',
  'meetings.create': '/meetings',
  'meetings.list': '/meetings',
  'room.chat': '/meetings/[id]',
  'room.tabs': '/meetings/[id]',
  'room.ending': '/meetings/[id]',
};

export function routeForAnchor(anchor: string): string | null {
  return DEMO_ANCHOR_ROUTES[anchor] ?? null;
}

const STEP_ORDER = [
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
] as const;

/** Presentation step: package copy + presentation bookkeeping. */
export interface DemoGuideStepView {
  key: string;
  anchor: string | null;
  title: string;
  why: string;
  tech: string | null;
  journeyActionId: string | null;
}

export function mergeGuideSteps(payload: DemoGuidePayload): DemoGuideStepView[] {
  const steps: DemoGuideStepView[] = [];
  for (const key of STEP_ORDER) {
    if (key.startsWith('UI')) {
      const step = payload.ui[key];
      if (!step) continue;
      steps.push({
        key,
        anchor: step.anchor,
        title: step.action,
        why: step.why,
        tech: step.tech ?? null,
        journeyActionId: null,
      });
    } else {
      const step = payload.journey[key];
      if (!step) continue;
      steps.push({
        key,
        anchor: null,
        title: step.action,
        why: step.why,
        tech: step.tech ?? null,
        journeyActionId: step.action,
      });
    }
  }
  steps.forEach(step => {
    if (step.key === 'J00') step.anchor = 'home.try-demo';
    if (step.key === 'J01') step.anchor = 'room.chat';
    if (step.key === 'J08') step.anchor = 'room.ending';
    if (step.key === 'J09') step.anchor = 'room.tabs';
  });
  return steps;
}
