// Phase 01 (P01-T05) store reset and storage helpers (test-only).
// meetingStore has no production reset action; these utilities restore the
// initial state between tests without changing runtime semantics.
import { useMeetingStore } from '@/stores/meetingStore';

export const MEETING_STORE_INITIAL = {
  meetings: [],
  meetingsById: {},
  currentMeeting: null,
  selectedMeetingId: null,
  sessionGeneration: null,
  disagreements: [],
  consensusList: [],
  isLoading: false,
  error: null,
  activeTurnParticipantId: null,
  turnStatus: 'idle',
  turnError: null,
  streamingMessage: null,
  contextStats: null,
  queueEntries: [],
  queueStatus: 'idle',
  queueError: null,
  queueNotice: null,
} as const;

export function resetMeetingStore(): void {
  useMeetingStore.setState({ ...(MEETING_STORE_INITIAL as object) } as never);
}

export function clearStorages(): void {
  window.localStorage.clear();
  window.sessionStorage.clear();
}

export function seedSession(key: string, value: string): void {
  window.sessionStorage.setItem(key, value);
}

export function readSession(key: string): string | null {
  return window.sessionStorage.getItem(key);
}
