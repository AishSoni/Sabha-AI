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
    thinking_content: string | null;
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
    status: 'active' | 'voting' | 'ended' | 'archived';
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

    async archiveMeeting(meetingId: string): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/archive`, {
            method: 'POST',
        });
        return handleResponse(response);
    },

    async unarchiveMeeting(meetingId: string): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/unarchive`, {
            method: 'POST',
        });
        return handleResponse(response);
    },

    async deleteMeeting(meetingId: string): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}`, {
            method: 'DELETE',
        });
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

    // AI Turns (Streaming)
    async *streamTurn(meetingId: string, participantId: string): AsyncGenerator<StreamEvent> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/turn/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participant_id: participantId }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || `API Error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete lines only (lines ending with \n)
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);

                    // Skip empty lines (SSE uses \n\n to separate events)
                    if (!line) continue;

                    // Parse data lines
                    if (line.startsWith('data:')) {
                        const jsonStr = line.slice(5).trim();
                        if (jsonStr) {
                            try {
                                const event = JSON.parse(jsonStr) as StreamEvent;
                                console.log('[SSE Event]', event.type, event.content?.slice(0, 50));
                                yield event;
                            } catch (e) {
                                console.error('[SSE Parse Error]', jsonStr.slice(0, 100), e);
                            }
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
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

    // Context stats
    async getContextStats(meetingId: string): Promise<ContextStats> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/context-stats`);
        return handleResponse(response);
    },

    // End meeting
    async endMeeting(meetingId: string, forceEnd: boolean): Promise<EndMeetingResponse> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_end: forceEnd }),
        });
        return handleResponse(response);
    },
};

export interface ContextStats {
    current_tokens: number;
    max_tokens: number;
    usage_percent: number;
    message_tokens?: number;
    system_tokens?: number;
    agenda_tokens?: number;
    message_count: number;
    participant_count: number;
}

// Streaming event types
export type StreamEventType = 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'citation' | 'done' | 'error';

export interface StreamEvent {
    type: StreamEventType;
    content?: string;
    tool_name?: string;
    tool_arguments?: Record<string, unknown>;
    tool_result?: string;
    source?: string;
    title?: string;
    url?: string;
    snippet?: string;
    message_id?: string;
    usage?: Record<string, number>;
}

// End meeting types
export interface EndMeetingVote {
    participant_id: string;
    participant_name: string;
    vote: boolean;
    reason: string;
}

export interface EndMeetingResponse {
    success: boolean;
    votes: EndMeetingVote[];
    summary: string | null;
    message: string;
}
