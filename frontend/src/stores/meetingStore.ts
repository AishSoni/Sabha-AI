/**
 * Meeting Store - Zustand state management for Sabha meetings.
 *
 * Phase 07 reliability: every async result carries its captured meeting
 * identity and commits only to the still-selected meeting. Navigation
 * aborts the local subscription (never server execution). Tool results
 * pair by execution identity, never by bare tool name.
 */

import { create } from 'zustand';
import {
    api,
    ApiError,
    isDemoSessionFor,
    Meeting,
    MeetingWithParticipants,
    Disagreement,
    Consensus,
    QueueEntry,
    ContextStats,
} from '@/lib/api';
import type { TurnStreamEvent } from '@/lib/turn-events';

// Streaming state for a message being generated
export interface StreamingToolCall {
    executionId: string;
    providerCallId: string | null;
    name: string;
    arguments?: Record<string, unknown>;
    result?: string;
    outcome?: string | null;
    isExecuting: boolean;
}

export interface StreamingCitation {
    source: string;
    title?: string;
    url?: string;
    snippet?: string;
}

export interface StreamingMessage {
    meetingId: string;
    turnId: string | null;
    participantId: string;
    participantName: string;
    participantColor: string;
    content: string;
    thinkingContent: string;
    toolCalls: StreamingToolCall[];
    citations: StreamingCitation[];
    isComplete: boolean;
}

export type TurnStatus = 'idle' | 'running' | 'reconnecting' | 'failed';
export type QueueStatus = 'idle' | 'loading' | 'saving' | 'error';

interface MeetingState {
    // Data
    meetings: Meeting[];
    meetingsById: Record<string, MeetingWithParticipants>;
    currentMeeting: MeetingWithParticipants | null;
    /** Route-selected identity; async commits must match it before writing. */
    selectedMeetingId: string | null;
    /** Session generation; a change invalidates old requests/subscriptions. */
    sessionGeneration: number | null;
    disagreements: Disagreement[];
    consensusList: Consensus[];

    // UI State
    isLoading: boolean;
    error: string | null;
    activeTurnParticipantId: string | null;
    turnStatus: TurnStatus;
    turnError: string | null;

    // Streaming state
    streamingMessage: StreamingMessage | null;

    // Context stats
    contextStats: ContextStats | null;

    // Pending message queue (server-authoritative content)
    queueEntries: QueueEntry[];
    queueStatus: QueueStatus;
    queueError: string | null;
    queueNotice: string | null;

    // Actions
    fetchMeetings: () => Promise<void>;
    createMeeting: (name: string, agenda?: string) => Promise<MeetingWithParticipants>;
    loadMeeting: (meetingId: string) => Promise<void>;
    sendUserMessage: (content: string) => Promise<void>;
    fetchQueue: () => Promise<void>;
    editQueueEntry: (entryId: string, content: string) => Promise<boolean>;
    removeQueueEntry: (entryId: string) => Promise<boolean>;
    clearQueueNotice: () => void;
    executeTurn: (participantId: string) => Promise<void>;
    executeTurnStreaming: (participantId: string) => Promise<void>;
    fetchContextStats: () => Promise<void>;
    setCurrentMeeting: (meeting: MeetingWithParticipants) => void;
    setSessionGeneration: (generation: number | null) => void;
    /** Abort the local event subscription (server execution continues). */
    cancelLocalSubscription: () => void;
    clearError: () => void;
}

/** Active turn subscription; navigation aborts it (server work continues). */
let activeStream: AbortController | null = null;

function abortActiveStream() {
    if (activeStream) {
        try {
            activeStream.abort();
        } catch {
            /* already settled */
        }
        activeStream = null;
    }
}

function randomKey(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return `key-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function queueConflictMessage(err: unknown): string {
    if (err instanceof ApiError) {
        if (err.code === 'already_dispatched') return 'Already sent — it is now in the chat and can no longer be edited.';
        if (err.code === 'revision_conflict') return 'Changed elsewhere — reloaded the latest pending list. Copy your draft and retry.';
        if (err.code === 'queue_not_drained') return 'A turn or vote is using the queue — try again when the meeting is idle.';
        if (err.code === 'meeting_not_active') return 'This meeting is no longer active, so the queue is read-only.';
        return err.message;
    }
    return (err as Error).message;
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
    // Initial state
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

    // Fetch all meetings
    fetchMeetings: async () => {
        set({ isLoading: true, error: null });
        try {
            const meetings = await api.listMeetings();
            set({ meetings, isLoading: false });
        } catch (err) {
            set({ error: (err as Error).message, isLoading: false });
        }
    },

    // Create a new meeting
    createMeeting: async (name: string, agenda?: string) => {
        set({ isLoading: true, error: null });
        try {
            const meeting = await api.createMeeting(name, agenda);
            set((state) => ({
                meetings: [meeting, ...state.meetings],
                meetingsById: { ...state.meetingsById, [meeting.id]: meeting },
                currentMeeting: meeting,
                selectedMeetingId: meeting.id,
                disagreements: [],
                consensusList: [],
                queueEntries: [],
                queueError: null,
                queueNotice: null,
                isLoading: false,
            }));
            return meeting;
        } catch (err) {
            set({ error: (err as Error).message, isLoading: false });
            throw err;
        }
    },

    // Load a specific meeting; stale responses never overwrite a newer selection.
    loadMeeting: async (meetingId: string) => {
        abortActiveStream();
        const generation = get().sessionGeneration;
        set({
            selectedMeetingId: meetingId,
            isLoading: true,
            error: null,
            streamingMessage: null,
            turnStatus: 'idle',
            turnError: null,
            activeTurnParticipantId: null,
        });
        const stillCurrent = () =>
            get().selectedMeetingId === meetingId &&
            get().sessionGeneration === generation;
        try {
            const [meeting, disagreements, consensusList, queue] = await Promise.all([
                api.getMeeting(meetingId),
                api.getDisagreements(meetingId),
                api.getConsensus(meetingId),
                api.getQueue(meetingId).catch(() => [] as QueueEntry[]),
            ]);
            if (!stillCurrent()) return;
            set((state) => ({
                currentMeeting: meeting,
                meetingsById: { ...state.meetingsById, [meeting.id]: meeting },
                disagreements,
                consensusList,
                queueEntries: queue,
                queueError: null,
                isLoading: false,
            }));

            // Context stats resolve independently; still guarded by identity.
            try {
                const contextStats = await api.getContextStats(meetingId);
                if (!stillCurrent()) return;
                // Double-check the guard reads the same meeting (voids B-09 stats race).
                if (get().selectedMeetingId !== meetingId) return;
                set({ contextStats });
            } catch (err) {
                console.error('Failed to fetch context stats:', err);
            }
        } catch (err) {
            if (!stillCurrent()) return;
            set({ error: (err as Error).message, isLoading: false });
        }
    },

    // Send a user message: commits immediately when idle, queues FIFO behind
    // a running turn. The commit applies only to the meeting that accepted it.
    sendUserMessage: async (content: string) => {
        const { currentMeeting } = get();
        if (!currentMeeting || !content.trim()) return;
        const meetingId = currentMeeting.id;
        const generation = get().sessionGeneration;

        set({ error: null, queueError: null });
        try {
            const result = await api.submitMessage(meetingId, content.trim(), randomKey());
            if (get().selectedMeetingId !== meetingId || get().sessionGeneration !== generation) return;
            if (!result.queued) {
                set((state) => ({
                    currentMeeting:
                        state.currentMeeting && state.currentMeeting.id === meetingId
                            ? { ...state.currentMeeting, messages: [...state.currentMeeting.messages, result.message] }
                            : state.currentMeeting,
                }));
            } else {
                const queue = await api.getQueue(meetingId).catch(() => get().queueEntries);
                if (get().selectedMeetingId !== meetingId || get().sessionGeneration !== generation) return;
                const position = queue.findIndex((e) => e.entryId === result.entry.entryId) + 1;
                set({
                    queueEntries: queue,
                    queueNotice:
                        position > 0
                            ? `Queued behind the running turn (position ${position}). It will send automatically.`
                            : 'Queued behind the running turn. It will send automatically.',
                });
            }
        } catch (err) {
            if (get().selectedMeetingId !== meetingId || get().sessionGeneration !== generation) return;
            if (err instanceof ApiError && err.code === 'queued') {
                const queue = await api.getQueue(meetingId).catch(() => get().queueEntries);
                if (get().selectedMeetingId !== meetingId) return;
                set({ queueEntries: queue, queueNotice: 'Queued behind the running turn. It will send automatically.' });
                return;
            }
            set({ error: (err as Error).message });
        }
    },

    fetchQueue: async () => {
        const { currentMeeting } = get();
        if (!currentMeeting) return;
        const meetingId = currentMeeting.id;
        const generation = get().sessionGeneration;
        set({ queueStatus: 'loading', queueError: null });
        try {
            const queue = await api.getQueue(meetingId);
            if (get().selectedMeetingId !== meetingId || get().sessionGeneration !== generation) return;
            set({ queueEntries: queue, queueStatus: 'idle' });
        } catch (err) {
            if (get().selectedMeetingId !== meetingId || get().sessionGeneration !== generation) return;
            set({ queueStatus: 'error', queueError: (err as Error).message });
        }
    },

    editQueueEntry: async (entryId: string, content: string) => {
        const { currentMeeting, queueEntries } = get();
        if (!currentMeeting || !content.trim()) return false;
        const meetingId = currentMeeting.id;
        const entry = queueEntries.find((e) => e.entryId === entryId);
        if (!entry) return false;
        set({ queueStatus: 'saving', queueError: null });
        try {
            const updated = await api.editQueueEntry(meetingId, entryId, content.trim(), entry.revision);
            if (get().selectedMeetingId !== meetingId) return true;
            set((state) => ({
                queueEntries: state.queueEntries.map((e) => (e.entryId === entryId ? updated : e)),
                queueStatus: 'idle',
            }));
            return true;
        } catch (err) {
            // Conflict: reload authoritative entries; the caller's unsaved
            // draft stays in the component for explicit retry/copy.
            const queue = await api.getQueue(meetingId).catch(() => get().queueEntries);
            if (get().selectedMeetingId !== meetingId) return false;
            set({ queueEntries: queue, queueStatus: 'error', queueError: queueConflictMessage(err) });
            return false;
        }
    },

    removeQueueEntry: async (entryId: string) => {
        const { currentMeeting, queueEntries } = get();
        if (!currentMeeting) return false;
        const meetingId = currentMeeting.id;
        const entry = queueEntries.find((e) => e.entryId === entryId);
        if (!entry) return false;
        set({ queueStatus: 'saving', queueError: null });
        try {
            await api.removeQueueEntry(meetingId, entryId, entry.revision);
            if (get().selectedMeetingId !== meetingId) return true;
            set((state) => ({
                queueEntries: state.queueEntries.filter((e) => e.entryId !== entryId),
                queueStatus: 'idle',
            }));
            return true;
        } catch (err) {
            const queue = await api.getQueue(meetingId).catch(() => get().queueEntries);
            if (get().selectedMeetingId !== meetingId) return false;
            set({ queueEntries: queue, queueStatus: 'error', queueError: queueConflictMessage(err) });
            return false;
        }
    },

    clearQueueNotice: () => set({ queueNotice: null, queueError: null }),

    // Execute an AI participant's turn (non-streaming fallback)
    executeTurn: async (participantId: string) => {
        const { currentMeeting } = get();
        if (!currentMeeting) return;
        const meetingId = currentMeeting.id;
        const generation = get().sessionGeneration;

        set({ activeTurnParticipantId: participantId, error: null });
        try {
            const response = await api.executeTurn(meetingId, participantId);
            if (get().selectedMeetingId !== meetingId || get().sessionGeneration !== generation) return;

            set((state) => ({
                currentMeeting:
                    state.currentMeeting && state.currentMeeting.id === meetingId
                        ? { ...state.currentMeeting, messages: [...state.currentMeeting.messages, response.message] }
                        : state.currentMeeting,
                disagreements: [...state.disagreements, ...response.disagreements],
                consensusList: [...state.consensusList, ...response.consensus],
                activeTurnParticipantId: null,
            }));
        } catch (err) {
            if (get().selectedMeetingId !== meetingId || get().sessionGeneration !== generation) return;
            set({ error: (err as Error).message, activeTurnParticipantId: null });
        }
    },

    // Execute an AI participant's turn with streaming
    executeTurnStreaming: async (participantId: string) => {
        const snapshot = get().currentMeeting;
        if (!snapshot) return;
        const meetingId = snapshot.id;
        const generation = get().sessionGeneration;

        const participant = snapshot.participants.find((p) => p.id === participantId);
        if (!participant) return;
        const beforeCount = snapshot.messages.length;

        abortActiveStream();
        const controller = new AbortController();
        activeStream = controller;

        const stillCurrent = () =>
            !controller.signal.aborted &&
            get().selectedMeetingId === meetingId &&
            get().sessionGeneration === generation;

        // Initialize streaming state
        set({
            activeTurnParticipantId: participantId,
            error: null,
            turnStatus: 'running',
            turnError: null,
            streamingMessage: {
                meetingId,
                turnId: null,
                participantId,
                participantName: participant.name,
                participantColor: participant.color,
                content: '',
                thinkingContent: '',
                toolCalls: [],
                citations: [],
                isComplete: false,
            },
        });

        const applyEvent = (event: TurnStreamEvent) => {
            if (!stillCurrent()) return;
            const { streamingMessage } = get();
            if (!streamingMessage || streamingMessage.meetingId !== meetingId) return;
            if (event.turnId && !streamingMessage.turnId) {
                set({ streamingMessage: { ...streamingMessage, turnId: event.turnId } });
            }
            const current = get().streamingMessage;
            if (!current) return;

            switch (event.kind) {
                case 'text_delta':
                    set({
                        streamingMessage: { ...current, content: current.content + (event.content || '') },
                    });
                    break;

                case 'thinking':
                    set({
                        streamingMessage: {
                            ...current,
                            thinkingContent: current.thinkingContent + (event.content || ''),
                        },
                    });
                    break;

                case 'tool_call':
                    set({
                        streamingMessage: {
                            ...current,
                            toolCalls: [
                                ...current.toolCalls,
                                {
                                    executionId: event.toolExecutionId ?? `legacy:${meetingId}:${current.toolCalls.length}`,
                                    providerCallId: event.providerCallId,
                                    name: event.toolName || '',
                                    arguments: event.toolArgs ?? undefined,
                                    isExecuting: true,
                                },
                            ],
                        },
                    });
                    break;

                case 'tool_result': {
                    let matched = false;
                    const toolCalls = current.toolCalls.map((tc) => {
                        if (matched) return tc;
                        const byExecution = event.toolExecutionId && tc.executionId === event.toolExecutionId;
                        const byProviderCall =
                            event.providerCallId && tc.providerCallId && tc.providerCallId === event.providerCallId;
                        const byNameFallback =
                            !event.toolExecutionId && !event.providerCallId && tc.name === event.toolName && tc.isExecuting;
                        if (byExecution || byProviderCall || byNameFallback) {
                            matched = true;
                            return { ...tc, result: event.toolResult ?? undefined, outcome: event.toolOutcome, isExecuting: false };
                        }
                        return tc;
                    });
                    set({ streamingMessage: { ...current, toolCalls } });
                    break;
                }

                case 'citation':
                    set({
                        streamingMessage: {
                            ...current,
                            citations: [
                                ...current.citations,
                                {
                                    source: event.raw && typeof event.raw === 'object'
                                        ? String((event.raw as Record<string, unknown>).source ?? 'source')
                                        : 'source',
                                    title:
                                        event.raw && typeof event.raw === 'object'
                                            ? (event.raw as Record<string, unknown>).title as string | undefined
                                            : undefined,
                                    url:
                                        event.raw && typeof event.raw === 'object'
                                            ? (event.raw as Record<string, unknown>).url as string | undefined
                                            : undefined,
                                    snippet: event.content ?? undefined,
                                },
                            ],
                        },
                    });
                    break;

                case 'terminal':
                case 'error':
                    break;
            }
        };

        const reconcileAfterTerminal = async () => {
            // Authoritative reload; only commits to the still-selected meeting.
            try {
                const freshData = await api.getMeeting(meetingId);
                if (!stillCurrent()) return;
                set((state) => ({
                    meetingsById: { ...state.meetingsById, [freshData.id]: freshData },
                    currentMeeting: state.currentMeeting?.id === meetingId ? freshData : state.currentMeeting,
                }));
                const [disagreements, consensusList, contextStats, queue] = await Promise.all([
                    api.getDisagreements(meetingId),
                    api.getConsensus(meetingId),
                    api.getContextStats(meetingId).catch(() => get().contextStats),
                    api.getQueue(meetingId).catch(() => get().queueEntries),
                ]);
                if (!stillCurrent()) return;
                set({ disagreements, consensusList, contextStats: contextStats ?? get().contextStats, queueEntries: queue });
            } catch (err) {
                console.error('Failed to reconcile turn result:', err);
            }
        };

        try {
            let outcome: { terminal: TurnStreamEvent | null; eofWithoutTerminal: boolean; aborted: boolean };
            if (isDemoSessionFor(meetingId)) {
                // Recorded demo turn: the server starts the SEALed journey
                // action through the SHARED TurnEngine and returns the normal
                // turn identity; the room consumes the SAME turn journal the
                // regular streaming path uses. The requested participant is
                // advisory — the server binds the specialist and streams
                // honest tool calls/citations into the room.
                const start = await api.startDemoRecordedTurn({
                    meetingId,
                    actionId: 'submit_bond_question',
                    idempotencyKey: randomKey(),
                });
                if (!stillCurrent()) return;
                set((state) => ({
                    streamingMessage: state.streamingMessage
                        ? { ...state.streamingMessage, turnId: start.turn_id }
                        : state.streamingMessage,
                }));
                const current = get().streamingMessage;
                if (current && start.participant_name) {
                    set({
                        streamingMessage: {
                            ...current,
                            participantId: start.participant_id || current.participantId,
                            participantName: start.participant_name,
                        },
                    });
                }
                outcome = await api.subscribeTurnJournal({
                    meetingId,
                    turnId: start.turn_id,
                    signal: controller.signal,
                    onEvent: applyEvent,
                });
            } else {
                outcome = await api.subscribeTurnEvents({
                    meetingId,
                    participantId,
                    signal: controller.signal,
                    onEvent: applyEvent,
                });
            }
            if (activeStream === controller) activeStream = null;
            if (!stillCurrent()) return;

            if (outcome.aborted) {
                // Navigated away mid-turn: subscription stops, server work (if
                // any) continues. Local provisional state is already dropped
                // by the navigation guard; nothing further to commit.
                set({ streamingMessage: null, activeTurnParticipantId: null, turnStatus: 'idle' });
                return;
            }

            if (outcome.eofWithoutTerminal) {
                // Connection loss is not completion: show reconnecting, then
                // reconcile against authoritative server state.
                set({ turnStatus: 'reconnecting' });
                await reconcileAfterTerminal();
                if (!stillCurrent()) return;
                const grew =
                    (get().currentMeeting?.id === meetingId ? get().currentMeeting?.messages.length ?? 0 : 0) > beforeCount;
                if (grew) {
                    set({ streamingMessage: null, activeTurnParticipantId: null, turnStatus: 'idle' });
                } else {
                    set({
                        streamingMessage: null,
                        activeTurnParticipantId: null,
                        turnStatus: 'failed',
                        turnError: 'Connection lost before the turn finished. The meeting was reloaded — retry the turn if no new answer arrived.',
                    });
                }
                return;
            }

            const terminal = outcome.terminal;
            if (terminal && terminal.terminalKind === 'completed') {
                await reconcileAfterTerminal();
                if (!stillCurrent()) return;
                set({ streamingMessage: null, activeTurnParticipantId: null, turnStatus: 'idle' });
                return;
            }
            await reconcileAfterTerminal();
            if (!stillCurrent()) return;
            set({
                streamingMessage: null,
                activeTurnParticipantId: null,
                turnStatus: 'failed',
                turnError:
                    terminal?.errorMessage ||
                    (terminal?.kind === 'error' ? terminal.errorMessage : null) ||
                    'The turn failed. The meeting was reloaded — retry if needed.',
            });
        } catch (err) {
            if (activeStream === controller) activeStream = null;
            if (!stillCurrent()) return;
            set({
                error: (err as Error).message,
                streamingMessage: null,
                activeTurnParticipantId: null,
                turnStatus: 'failed',
                turnError: (err as Error).message,
            });
        }
    },

    // Fetch context stats for current meeting
    fetchContextStats: async () => {
        const { currentMeeting } = get();
        if (!currentMeeting) return;
        const meetingId = currentMeeting.id;
        const generation = get().sessionGeneration;

        try {
            const contextStats = await api.getContextStats(meetingId);
            if (get().selectedMeetingId !== meetingId || get().sessionGeneration !== generation) return;
            set({ contextStats });
        } catch (err) {
            console.error('Failed to fetch context stats:', err);
        }
    },

    // Set current meeting (for refreshing after end meeting)
    setCurrentMeeting: (meeting) =>
        set((state) => ({
            currentMeeting: meeting,
            selectedMeetingId: meeting.id,
            meetingsById: { ...state.meetingsById, [meeting.id]: meeting },
        })),

    // A generation change invalidates old requests/subscriptions (reused by
    // Phase 08 sessions; exercised here with synthetic generations).
    setSessionGeneration: (generation) => {
        if (get().sessionGeneration === generation) return;
        abortActiveStream();
        set({
            sessionGeneration: generation,
            streamingMessage: null,
            activeTurnParticipantId: null,
            turnStatus: 'idle',
            turnError: null,
            queueEntries: [],
            queueError: null,
            queueNotice: null,
        });
    },

    clearError: () => set({ error: null }),

    cancelLocalSubscription: () => {
        abortActiveStream();
    },
}));
