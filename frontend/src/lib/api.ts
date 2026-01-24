/**
 * Sabha API Client
 * Handles all backend communication
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface ProviderConfig {
    provider: string;
    model: string;
    temperature: number;
}

export interface AIParticipant {
    id: string;
    meeting_id: string;
    name: string;
    role: string;
    system_prompt: string;
    provider_config: ProviderConfig;
    color: string;
    created_at: string;
}

export interface Message {
    id: string;
    meeting_id: string;
    sender_type: 'user' | 'ai' | 'system';
    sender_id: string | null;
    sender_name: string;
    content: string;
    citations: Citation[];
    tool_artifacts: Record<string, unknown> | null;
    estimated_cost: number;
    created_at: string;
}

export interface Citation {
    source: string;
    title?: string;
    url?: string;
    snippet?: string;
}

export interface Meeting {
    id: string;
    user_id: string | null;
    name: string;
    agenda: string;
    status: 'active' | 'archived';
    total_cost: number;
    created_at: string;
}

export interface MeetingWithParticipants extends Meeting {
    participants: AIParticipant[];
    messages: Message[];
}

export interface Disagreement {
    id: string;
    meeting_id: string;
    source_ai_id: string;
    target_name: string;
    topic: string;
    reasoning: string;
    severity: number;
    status: 'open' | 'resolved' | 'conceded';
    created_at: string;
}

export interface Consensus {
    id: string;
    meeting_id: string;
    participants: string[];
    topic: string;
    strength: number;
    created_at: string;
}

export interface TurnResponse {
    message: Message;
    disagreements: Disagreement[];
    consensus: Consensus[];
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `API Error: ${response.status}`);
    }
    return response.json();
}

export const api = {
    // Meetings
    async createMeeting(name: string, agenda: string = ''): Promise<MeetingWithParticipants> {
        const response = await fetch(`${API_BASE}/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, agenda }),
        });
        return handleResponse(response);
    },

    async listMeetings(): Promise<Meeting[]> {
        const response = await fetch(`${API_BASE}/meetings`);
        return handleResponse(response);
    },

    async getMeeting(meetingId: string): Promise<MeetingWithParticipants> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}`);
        return handleResponse(response);
    },

    // Messages
    async sendUserMessage(meetingId: string, content: string): Promise<Message> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });
        return handleResponse(response);
    },

    // AI Turns
    async executeTurn(meetingId: string, participantId: string): Promise<TurnResponse> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participant_id: participantId }),
        });
        return handleResponse(response);
    },

    // Conflicts
    async getDisagreements(meetingId: string): Promise<Disagreement[]> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/disagreements`);
        return handleResponse(response);
    },

    async getConsensus(meetingId: string): Promise<Consensus[]> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/consensus`);
        return handleResponse(response);
    },

    // Participant templates
    async getParticipantTemplates(): Promise<Array<{ name: string; role: string; system_prompt: string; color: string }>> {
        const response = await fetch(`${API_BASE}/participants/templates`);
        return handleResponse(response);
    },
};
