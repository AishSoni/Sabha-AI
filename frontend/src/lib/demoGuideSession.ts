// Demo session client state probe (sessionStorage only, never URLs).

import { loadDemoCredential, loadDemoMeetingId } from './demoGuideApi';

/** True when the visitor has any demo walkthrough client state. */
export function hasDemoSessionState(): boolean {
  return Boolean(loadDemoCredential() || loadDemoMeetingId());
}
