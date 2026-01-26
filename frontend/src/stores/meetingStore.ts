/**
 * Meeting Store - Zustand state management for Sabha meetings
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
} from '@/lib/api';

// Streaming state for a message being generated
export interface StreamingMessage {
    participantId: string;
    participantName: string;
    participantColor: string;
    content: string;
    thinkingContent: string;
    toolCalls: Array<{
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

    // Actions
    fetchMeetings: () => Promise<void>;
    createMeeting: (name: string, agenda?: string) => Promise<MeetingWithParticipants>;
    loadMeeting: (meetingId: string) => Promise<void>;
    sendUserMessage: (content: string) => Promise<void>;
    executeTurn: (participantId: string) => Promise<void>;
    executeTurnStreaming: (participantId: string) => Promise<void>;
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
        set({ isLoading: true, error: null });
        try {
            const [meeting, disagreements, consensusList] = await Promise.all([
                api.getMeeting(meetingId),
                api.getDisagreements(meetingId),
                api.getConsensus(meetingId),
            ]);
            set({ currentMeeting: meeting, disagreements, consensusList, isLoading: false });
        } catch (err) {
            set({ error: (err as Error).message, isLoading: false });
        }
    },

    // Send a user message
    sendUserMessage: async (content: string) => {
        const { currentMeeting } = get();
        if (!currentMeeting) return;

        set({ error: null });
        try {
            const message = await api.sendUserMessage(currentMeeting.id, content);
            set((state) => ({
                currentMeeting: state.currentMeeting
                    ? { ...state.currentMeeting, messages: [...state.currentMeeting.messages, message] }
                    : null,
            }));
        } catch (err) {
            set({ error: (err as Error).message });
        }
    },

    // Execute an AI participant's turn (non-streaming fallback)
    executeTurn: async (participantId: string) => {
        const { currentMeeting } = get();
        if (!currentMeeting) return;

        set({ activeTurnParticipantId: participantId, error: null });
        try {
            const response = await api.executeTurn(currentMeeting.id, participantId);

            set((state) => ({
                currentMeeting: state.currentMeeting
                    ? { ...state.currentMeeting, messages: [...state.currentMeeting.messages, response.message] }
                    : null,
                disagreements: [...state.disagreements, ...response.disagreements],
                consensusList: [...state.consensusList, ...response.consensus],
                activeTurnParticipantId: null,
            }));
        } catch (err) {
            set({ error: (err as Error).message, activeTurnParticipantId: null });
        }
    },

    // Execute an AI participant's turn with streaming
    executeTurnStreaming: async (participantId: string) => {
        const { currentMeeting } = get();
        if (!currentMeeting) return;

        const participant = currentMeeting.participants.find(p => p.id === participantId);
        if (!participant) return;

        // Initialize streaming state
        set({
            activeTurnParticipantId: participantId,
            error: null,
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
            for await (const event of api.streamTurn(currentMeeting.id, participantId)) {
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
                                    tc.name === event.tool_name
                                        ? { ...tc, result: event.tool_result, isExecuting: false }
                                        : tc
                                ),
                            },
                        });
                        break;

                    case 'done':
                        // Reload the meeting to get the final saved message
                        const freshData = await api.getMeeting(currentMeeting.id);
                        set({
                            currentMeeting: freshData,
                            streamingMessage: null,
                            activeTurnParticipantId: null,
                        });

                        // Also refresh disagreements/consensus
                        const [disagreements, consensusList] = await Promise.all([
                            api.getDisagreements(currentMeeting.id),
                            api.getConsensus(currentMeeting.id),
                        ]);
                        set({ disagreements, consensusList });
                        break;

                    case 'error':
                        set({
                            error: event.content || 'Streaming error',
                            streamingMessage: null,
                            activeTurnParticipantId: null,
                        });
                        break;
                }
            }
        } catch (err) {
            set({
                error: (err as Error).message,
                streamingMessage: null,
                activeTurnParticipantId: null,
            });
        }
    },

    clearError: () => set({ error: null }),
}));
