// Demo guide transport: shared guide content + journey-state reads/writes.
// Reads the single DB package (GET /guide); journey mutations stay
// server-authoritative via /journey-progress. Never parses routes/HTML from DB.

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:8000/api';

export const DEMO_MEETING_STORAGE_KEY = 'sabha.demo.meetingId' as const;
export const DEMO_GUIDE_UI_STORAGE_KEY = 'sabha.demo.guideUi' as const;

export interface DemoGuideJourneyStep {
  action: string;
  why: string;
  tech?: string;
}

export interface DemoGuideUiStep {
  anchor: string;
  action: string;
  why: string;
  tech?: string;
}

export interface DemoGuideInstrument {
  isin: string;
  name: string;
}

export interface DemoGuideSpecialist {
  specialist_id: string;
  title: string;
  remit: string;
}

export interface DemoGuidePayload {
  scenario_id: string;
  scenario_revision: number;
  content_version: number;
  disclosure: string;
  instrument: DemoGuideInstrument;
  snapshot_date: string;
  journey: Record<string, DemoGuideJourneyStep>;
  ui: Record<string, DemoGuideUiStep>;
  specialists: DemoGuideSpecialist[];
  recorded_analysis: boolean;
  approval_status: string;
}

export interface DemoJourneyState {
  session: {
    session_id: string;
    generation: number;
    scenario_id: string;
    action_count: number;
    expires_at: string;
  } | null;
  progress: {
    stage: string | null;
    completed: string[];
    failed: string[];
    meeting_id: string | null;
    specialists: string[];
    turn_reference: string | null;
  } | null;
  instrument: DemoGuideInstrument;
  disclosure: string;
}

export interface DemoRealSessionStart {
  credential: string;
  session: {
    session_id: string;
    generation: number;
    scenario_id: string;
    action_count: number;
    expires_at: string;
  };
  meeting: { meeting_id: string } | null;
  persona_ids: string[];
}

export interface DemoMeetingAttach {
  meeting: { meeting_id: string };
  persona_ids: string[];
}

export function loadDemoCredential(): string | null {
  try {
    const token = sessionStorage.getItem('sabha.demo.sessionToken');
    return token && !token.startsWith('real-') ? token : null;
  } catch {
    return null;
  }
}

export function loadDemoMeetingId(): string | null {
  try {
    return sessionStorage.getItem(DEMO_MEETING_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveDemoMeetingId(meetingId: string): void {
  try {
    sessionStorage.setItem(DEMO_MEETING_STORAGE_KEY, meetingId);
  } catch {
    /* storage unavailable: guide stays local-only */
  }
}

export function loadGuideUiCompleted(): string[] {
  try {
    const raw = sessionStorage.getItem(DEMO_GUIDE_UI_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveGuideUiCompleted(completed: string[]): void {
  try {
    sessionStorage.setItem(DEMO_GUIDE_UI_STORAGE_KEY, JSON.stringify(completed));
  } catch {
    /* ignore */
  }
}

export function markGuideUiCompleted(key: string): string[] {
  const done = loadGuideUiCompleted();
  if (!done.includes(key)) done.push(key);
  saveGuideUiCompleted(done);
  return done;
}

function toApiError(status: number, body: Record<string, unknown>): Error & { code: string; status: number } {
  const code = typeof body.code === 'string' ? body.code : typeof body.detail === 'string' ? 'http_error' : `http_${status}`;
  const message =
    typeof body.message === 'string'
      ? body.message
      : typeof body.detail === 'string'
        ? body.detail
        : 'demo request failed';
  const err = new Error(message) as Error & { code: string; status: number };
  err.code = code;
  err.status = status;
  return err;
}

async function demoRequest(
  path: string,
  init: { method: string; payload?: unknown; withCredential?: boolean },
): Promise<unknown> {
  const credential = loadDemoCredential();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Demo-scoped routes take the raw session credential; auth-free /guide
  // carries no header.
  if (init.withCredential !== false && credential) {
    headers.Authorization = `Bearer ${credential}`;
  }
  const response = await fetch(`${API_BASE}/v2/demo${path}`, {
    method: init.method,
    headers,
    body: init.payload !== undefined ? JSON.stringify(init.payload) : undefined,
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw toApiError(response.status, body);
  return body;
}

/** Auth-free guide content from the pinned DB package. */
export async function getDemoGuide(): Promise<DemoGuidePayload> {
  return (await demoRequest('/guide', { method: 'GET', withCredential: false })) as DemoGuidePayload;
}

/** Session progress for the walkthrough (404 unknown_session => not started). */
export async function getDemoJourneyState(): Promise<DemoJourneyState> {
  return (await demoRequest('/journey-state', { method: 'GET' })) as DemoJourneyState;
}

/** Client-observed journey actions (order is enforced by the server). */
export async function postDemoJourneyProgress(args: { actionId: string; idempotencyKey?: string }): Promise<unknown> {
  return await demoRequest('/journey-progress', {
    method: 'POST',
    payload: { action_id: args.actionId, idempotency_key: args.idempotencyKey },
  });
}

/** Session-only start: credential + seeded personas, no meeting. */
export async function startDemoWalkthroughSession(): Promise<DemoRealSessionStart> {
  return (await demoRequest('/real-session', { method: 'POST', payload: {} })) as DemoRealSessionStart;
}

/** Attach (pin) the real demo meeting for the current generation, idempotent. */
export async function attachDemoMeeting(): Promise<DemoMeetingAttach> {
  return (await demoRequest('/real-session', {
    method: 'POST',
    payload: { mode: 'meeting' },
  })) as unknown as DemoMeetingAttach;
}

/** Bounded once-per-generation follow-up fork meeting (J09 explore_followup). */
export async function createDemoFollowupFork(): Promise<{ meeting: { meeting_id: string }; fork: boolean }> {
  return (await demoRequest('/real-session', {
    method: 'POST',
    payload: { mode: 'fork' },
  })) as unknown as { meeting: { meeting_id: string }; fork: boolean };
}
