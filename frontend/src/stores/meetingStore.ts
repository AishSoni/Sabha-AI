/**
 * Meeting Store - Zustand state management for Sabha meetings
 */

import { create } from 'zustand';
import {
    api,
    Meeting,
    MeetingWithParticipants,
    Message,
    AIParticipant,
    Disagreement,
    Consensus,
} from '@/lib/api';

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

    // Actions
    fetchMeetings: () => Promise<void>;
    createMeeting: (name: string, agenda?: string) => Promise<MeetingWithParticipants>;
    loadMeeting: (meetingId: string) => Promise<void>;
    sendUserMessage: (content: string) => Promise<void>;
    executeTurn: (participantId: string) => Promise<void>;
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

    // Execute an AI participant's turn
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

    clearError: () => set({ error: null }),
}));
