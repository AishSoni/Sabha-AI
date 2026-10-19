/**
 * Meeting Store - Zustand state management for Sabha meetings
 *
 * Async operations are scoped with op-scope helpers: every operation captures
 * the meeting it started for and re-checks after each await. Late completions
 * for a meeting the user already left never mutate the presented meeting.
 */

import { create } from 'zustand';
import {
    api,
    Meeting,
    MeetingWithParticipants,
    Message,
    Disagreement,
    Consensus,
    StreamEvent,
    ContextStats,
} from '@/lib/api';
import { useSettingsStore } from './settings-store';
import { beginOperation, isCurrent, Operation } from '@/lib/op-scope';

// Streaming state for a message being generated
export interface StreamingMessage {
    participantId: string;
    participantName: string;
    participantColor: string;
    content: string;
    thinkingContent: string;
    toolCalls: Array<{
        id?: string;
        name: string;
        arguments?: Record<string, unknown>;
        result?: string;
        isExecuting: boolean;
    }>;
    isComplete: boolean;
}

interface MeetingState {
    // Data
    meetings: Meeting[];
    currentMeeting: MeetingWithParticipants | null;
    disagreements: Disagreement[];
    consensusList: Consensus[];

    // UI State
    isLoading: boolean;
    error: string | null;
    activeTurnParticipantId: string | null;

    // Streaming state
    streamingMessage: StreamingMessage | null;

    // Context stats
    contextStats: ContextStats | null;

    // Operation identities for in-flight async work (op-scope guards).
    // `loadOperation`: newest loadMeeting; earlier loads are superseded.
    // `turnOperation`: newest turn (streaming or not); a superseded turn may
    // only clear artifacts it still owns. `activeTurnOperation`: the turn that
    // owns the current busy indicator.
    loadOperation: Operation | null;
    turnOperation: Operation | null;
    activeTurnOperation: Operation | null;

    // Actions
    fetchMeetings: () => Promise<void>;
    createMeeting: (name: string, agenda?: string) => Promise<MeetingWithParticipants>;
    loadMeeting: (meetingId: string) => Promise<void>;
    sendUserMessage: (content: string) => Promise<boolean>;
    executeTurn: (participantId: string) => Promise<void>;
    executeTurnStreaming: (participantId: string) => Promise<void>;
    fetchContextStats: () => Promise<void>;
    setCurrentMeeting: (meeting: MeetingWithParticipants) => void;
    clearError: () => void;
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
    // Initial state
    meetings: [],
    currentMeeting: null,
    disagreements: [],
    consensusList: [],
    isLoading: false,
    error: null,
    activeTurnParticipantId: null,
    streamingMessage: null,
    contextStats: null,
    loadOperation: null,
    turnOperation: null,
    activeTurnOperation: null,

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
                currentMeeting: meeting,
                disagreements: [],
                consensusList: [],
                isLoading: false,
            }));
            return meeting;
        } catch (err) {
            set({ error: (err as Error).message, isLoading: false });
            throw err;
        }
    },

    // Load a specific meeting
    loadMeeting: async (meetingId: string) => {
        const operation = beginOperation(meetingId);
        set({ isLoading: true, error: null, loadOperation: operation });
        try {
            const [meeting, disagreements, consensusList] = await Promise.all([
                api.getMeeting(meetingId),
                api.getDisagreements(meetingId),
                api.getConsensus(meetingId),
            ]);

            // A superseded request must not overwrite newer meeting data.
            if (get().loadOperation?.operationId !== operation.operationId) {
                return;
            }
            set({ currentMeeting: meeting, disagreements, consensusList, isLoading: false });

            // Also fetch context stats
            try {
                const contextStats = await api.getContextStats(meetingId);
                if (get().loadOperation?.operationId !== operation.operationId) {
                    return;
                }
                set({ contextStats });
            } catch (err) {
                console.error('Failed to fetch context stats:', err);
            }
        } catch (err) {
            if (get().loadOperation?.operationId !== operation.operationId) {
                return;
            }
            set({ error: (err as Error).message, isLoading: false });
        }
    },

    // Send a user message
    sendUserMessage: async (content: string) => {
        const { currentMeeting } = get();
        if (!currentMeeting) return false;

        const operation = beginOperation(currentMeeting.id);
        set({ error: null });
        try {
            const message = await api.sendUserMessage(operation.meetingId, content);

            // Confirmed after navigation: don't touch the presented meeting.
            if (!isCurrent(operation, get().currentMeeting?.id ?? null)) {
                return false;
            }
            set((state) => ({
                currentMeeting: state.currentMeeting
                    ? { ...state.currentMeeting, messages: [...state.currentMeeting.messages, message] }
                    : null,
            }));
            return true;
        } catch (err) {
            if (isCurrent(operation, get().currentMeeting?.id ?? null)) {
                set({ error: (err as Error).message });
            }
            return false;
        }
    },

    // Execute an AI participant's turn (non-streaming fallback)
    executeTurn: async (participantId: string) => {
        const { currentMeeting } = get();
        if (!currentMeeting) return;

        const operation = beginOperation(currentMeeting.id);
        set({
            activeTurnParticipantId: participantId,
            error: null,
            turnOperation: operation,
            activeTurnOperation: operation,
        });
        try {
            // What the user configured in the browser (vault-backed BYOK)
            // is what must generate; fall back to participant/server config
            // when nothing is composed.
            const generationSettings =
                useSettingsStore.getState().composeGenerationSettings() ?? undefined;
            const response = await api.executeTurn(
                operation.meetingId,
                participantId,
                generationSettings
            );

            if (!isCurrent(operation, get().currentMeeting?.id ?? null)) {
                return;
            }
            if (get().activeTurnOperation?.operationId === operation.operationId) {
                set({ activeTurnParticipantId: null, activeTurnOperation: null });
            }
            set((state) => ({
                currentMeeting: state.currentMeeting
                    ? { ...state.currentMeeting, messages: [...state.currentMeeting.messages, response.message] }
                    : null,
                disagreements: [...state.disagreements, ...response.disagreements],
                consensusList: [...state.consensusList, ...response.consensus],
            }));
        } catch (err) {
            if (!isCurrent(operation, get().currentMeeting?.id ?? null)) {
                return;
            }
            if (get().activeTurnOperation?.operationId === operation.operationId) {
                set({ activeTurnParticipantId: null, activeTurnOperation: null });
            }
            set({ error: (err as Error).message });
        }
    },

    // Execute an AI participant's turn with streaming
    executeTurnStreaming: async (participantId: string) => {
        const { currentMeeting } = get();
        if (!currentMeeting) return;

        const participant = currentMeeting.participants.find(p => p.id === participantId);
        if (!participant) return;

        const operation = beginOperation(currentMeeting.id);
        const superseded = () =>
            !isCurrent(operation, get().currentMeeting?.id ?? null) ||
            get().turnOperation?.operationId !== operation.operationId;

        // Clear busy/streaming artifacts still owned by this turn. A newer
        // turn (same or another meeting) owns its own state; never clobber it.
        const abandonOwnedState = () => {
            set((state) => {
                const ownedTurn =
                    state.activeTurnOperation?.operationId === operation.operationId;
                const ownedStream =
                    state.turnOperation?.operationId === operation.operationId;
                if (!ownedTurn && !ownedStream) {
                    return {};
                }
                return {
                    activeTurnParticipantId: ownedTurn ? null : state.activeTurnParticipantId,
                    activeTurnOperation: ownedTurn ? null : state.activeTurnOperation,
                    streamingMessage: ownedStream ? null : state.streamingMessage,
                };
            });
        };

        // Initialize streaming state
        set({
            activeTurnParticipantId: participantId,
            error: null,
            turnOperation: operation,
            activeTurnOperation: operation,
            streamingMessage: {
                participantId,
                participantName: participant.name,
                participantColor: participant.color,
                content: '',
                thinkingContent: '',
                toolCalls: [],
                isComplete: false,
            },
        });

        try {
            // Same contract as the non-streaming turn: browser generation
            // settings (incl. BYOK key) ride along per request.
            const generationSettings =
                useSettingsStore.getState().composeGenerationSettings() ?? undefined;
            for await (const event of api.streamTurn(
                operation.meetingId,
                participantId,
                generationSettings
            )) {
                // A stream orphaned by navigation or by a newer turn stops
                // before touching state (and clears artifacts it still owns).
                if (superseded()) {
                    abandonOwnedState();
                    return;
                }
                const { streamingMessage } = get();
                if (!streamingMessage) continue;

                switch (event.type) {
                    case 'text':
                        set({
                            streamingMessage: {
                                ...streamingMessage,
                                content: streamingMessage.content + (event.content || ''),
                            },
                        });
                        break;

                    case 'thinking':
                        set({
                            streamingMessage: {
                                ...streamingMessage,
                                thinkingContent: streamingMessage.thinkingContent + (event.content || ''),
                            },
                        });
                        break;

                    case 'tool_call':
                        set({
                            streamingMessage: {
                                ...streamingMessage,
                                toolCalls: [
                                    ...streamingMessage.toolCalls,
                                    {
                                        id: event.tool_call_id,
                                        name: event.tool_name || '',
                                        arguments: event.tool_arguments,
                                        isExecuting: true,
                                    },
                                ],
                            },
                        });
                        break;

                    case 'tool_result':
                        set({
                            streamingMessage: {
                                ...streamingMessage,
                                toolCalls: streamingMessage.toolCalls.map(tc =>
                                    // Correlated events match by call id; legacy events
                                    // without ids fall back to name matching.
                                    (event.tool_call_id
                                        ? tc.id === event.tool_call_id
                                        : tc.name === event.tool_name)
                                        ? { ...tc, result: event.tool_result, isExecuting: false }
                                        : tc
                                ),
                            },
                        });
                        break;

                    case 'done': {
                        // Reload the meeting to get the final saved message
                        // (barrier: navigation may land during the refetch).
                        const freshData = await api.getMeeting(operation.meetingId);
                        if (superseded()) {
                            abandonOwnedState();
                            return;
                        }
                        if (get().activeTurnOperation?.operationId === operation.operationId) {
                            set({ activeTurnParticipantId: null, activeTurnOperation: null });
                        }
                        set({
                            currentMeeting: freshData,
                            streamingMessage: null,
                        });

                        // Also refresh disagreements/consensus and context stats
                        const [disagreements, consensusList, contextStats] = await Promise.all([
                            api.getDisagreements(operation.meetingId),
                            api.getConsensus(operation.meetingId),
                            api.getContextStats(operation.meetingId),
                        ]);
                        if (superseded()) {
                            return;
                        }
                        set({ disagreements, consensusList, contextStats });
                        break;
                    }

                    case 'error':
                        if (get().activeTurnOperation?.operationId === operation.operationId) {
                            set({ activeTurnParticipantId: null, activeTurnOperation: null });
                        }
                        set({
                            error: event.content || 'Streaming error',
                            streamingMessage: null,
                        });
                        break;
                }
            }
        } catch (err) {
            if (superseded()) {
                abandonOwnedState();
                return;
            }
            if (get().activeTurnOperation?.operationId === operation.operationId) {
                set({ activeTurnParticipantId: null, activeTurnOperation: null });
            }
            set({
                error: (err as Error).message,
                streamingMessage: null,
            });
        }
    },

    // Fetch context stats for current meeting
    fetchContextStats: async () => {
        const { currentMeeting } = get();
        if (!currentMeeting) return;

        const operation = beginOperation(currentMeeting.id);
        try {
            const contextStats = await api.getContextStats(operation.meetingId);
            if (!isCurrent(operation, get().currentMeeting?.id ?? null)) {
                return;
            }
            set({ contextStats });
        } catch (err) {
            console.error('Failed to fetch context stats:', err);
        }
    },

    // Set current meeting (for refreshing after end meeting)
    setCurrentMeeting: (meeting) => set({ currentMeeting: meeting }),

    clearError: () => set({ error: null }),
}));
