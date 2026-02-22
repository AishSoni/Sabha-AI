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
    async createMeeting(name: string, agenda: string = '', personaIds?: string[]): Promise<MeetingWithParticipants> {
        const response = await fetch(`${API_BASE}/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, agenda, persona_ids: personaIds }),
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

// ============== PERSONA TYPES ==============

export interface PersonaProviderConfig {
    provider: string;
    model: string;
    temperature: number;
    max_tokens: number;
}

export interface Persona {
    id: string;
    name: string;
    subtitle: string | null;
    color: string;
    avatar_url: string | null;
    provider_config: PersonaProviderConfig;
    is_default: boolean;
    user_id: string | null;
    stack_ids?: string[];
    created_at: string;
    updated_at: string;
}

export interface PersonaWithPrompt extends Persona {
    active_prompt: string | null;
    active_prompt_version: number | null;
}

export interface PersonaCreate {
    name: string;
    subtitle?: string;
    color?: string;
    avatar_url?: string;
    provider_config?: Partial<PersonaProviderConfig>;
    system_prompt?: string;
    user_id?: string;
    stack_ids?: string[];
}

export interface PersonaUpdate {
    name?: string;
    subtitle?: string;
    color?: string;
    avatar_url?: string;
    provider_config?: Partial<PersonaProviderConfig>;
    stack_ids?: string[];
}

export interface PromptVersion {
    id: string;
    persona_id: string;
    version: number;
    content: string;
    is_active: boolean;
    created_at: string;
}

export interface PersonaListResponse {
    personas: PersonaWithPrompt[];
    total: number;
}

// ============== PERSONA API ==============

export const personaApi = {
    async listPersonas(userId?: string, includeDefaults: boolean = true): Promise<PersonaListResponse> {
        const params = new URLSearchParams();
        if (userId) params.append('user_id', userId);
        params.append('include_defaults', String(includeDefaults));
        const response = await fetch(`${API_BASE}/personas?${params}`);
        return handleResponse(response);
    },

    async getPersona(personaId: string): Promise<PersonaWithPrompt> {
        const response = await fetch(`${API_BASE}/personas/${personaId}`);
        return handleResponse(response);
    },

    async createPersona(data: PersonaCreate): Promise<PersonaWithPrompt> {
        const response = await fetch(`${API_BASE}/personas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleResponse(response);
    },

    async updatePersona(personaId: string, data: PersonaUpdate): Promise<PersonaWithPrompt> {
        const response = await fetch(`${API_BASE}/personas/${personaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleResponse(response);
    },

    async deletePersona(personaId: string): Promise<void> {
        const response = await fetch(`${API_BASE}/personas/${personaId}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || `API Error: ${response.status}`);
        }
    },

    // Prompt versions
    async listPromptVersions(personaId: string): Promise<PromptVersion[]> {
        const response = await fetch(`${API_BASE}/personas/${personaId}/prompts`);
        return handleResponse(response);
    },

    async createPromptVersion(personaId: string, content: string): Promise<PromptVersion> {
        const response = await fetch(`${API_BASE}/personas/${personaId}/prompts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });
        return handleResponse(response);
    },

    async activatePromptVersion(personaId: string, version: number): Promise<void> {
        const response = await fetch(`${API_BASE}/personas/${personaId}/prompts/${version}/activate`, {
            method: 'POST',
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || `API Error: ${response.status}`);
        }
    },
};

// ============== SETTINGS TYPES ==============

export interface ProviderModelInfo {
    id: string;
    name: string;
    context_length: number;
    supports_tools: boolean;
    supports_streaming: boolean;
}

export interface ProviderInfo {
    id: string;
    name: string;
    description: string;
    requires_api_key: boolean;
    base_url?: string;
    models: ProviderModelInfo[];
    default_model: string;
    default_temperature: number;
    default_max_tokens: number;
}

export interface SystemAIConfig {
    provider: string;
    model: string;
    temperature: number;
    max_tokens: number;
}

export interface EnvironmentInfo {
    is_production: boolean;
    configured_providers: string[];
    default_provider: string;
    default_models: Record<string, string>;
}

export interface ProvidersListResponse {
    providers: ProviderInfo[];
    environment: EnvironmentInfo;
    system_ai: SystemAIConfig;
}

export interface TestKeyRequest {
    provider: 'openrouter' | 'gemini' | 'ollama';
    api_key: string;
    base_url?: string;
}

export interface TestKeyResponse {
    valid: boolean;
    message: string;
    models?: string[];
}

// ============== SETTINGS API ==============

export interface FetchModelsRequest {
    provider: 'openrouter' | 'gemini' | 'ollama';
    api_key?: string;
    base_url?: string;
}

export interface FetchedModelInfo {
    id: string;
    name: string;
    context_length?: number;
}

export interface FetchModelsResponse {
    success: boolean;
    models: FetchedModelInfo[];
    message: string;
}

export const settingsApi = {
    async getProviders(): Promise<ProvidersListResponse> {
        const response = await fetch(`${API_BASE}/settings/providers`);
        return handleResponse(response);
    },

    async testKey(request: TestKeyRequest): Promise<TestKeyResponse> {
        const response = await fetch(`${API_BASE}/settings/test-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        return handleResponse(response);
    },

    async fetchModels(request: FetchModelsRequest): Promise<FetchModelsResponse> {
        const response = await fetch(`${API_BASE}/settings/models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        return handleResponse(response);
    },
};

// ============== DOCUMENTS TYPES ==============

export interface Document {
    id: string;
    meeting_id: string | null;
    persona_id: string | null;
    file_name: string;
    file_type: string;
    file_size_bytes: number;
    chunk_count: number;
    qdrant_collection: string | null;
    status: 'processing' | 'indexed' | 'failed';
    error_message: string | null;
    created_at: string;
}

export interface DocumentUploadResponse {
    id: string;
    file_name: string;
    status: string;
    chunk_count: number;
    message: string;
}

export interface DocumentSearchResult {
    text: string;
    score: number;
    document_id: string;
    file_name: string;
    chunk_index: number;
}

export interface DocumentSearchResponse {
    query: string;
    results: DocumentSearchResult[];
    total_results: number;
}

// ============== DOCUMENTS API ==============

export const documentsApi = {
    async uploadDocument(
        file: File,
        meetingId?: string,
        personaId?: string,
        stackId?: string
    ): Promise<DocumentUploadResponse> {
        const formData = new FormData();
        formData.append('file', file);
        if (meetingId) formData.append('meeting_id', meetingId);
        if (personaId) formData.append('persona_id', personaId);
        if (stackId) formData.append('stack_id', stackId);

        const response = await fetch(`${API_BASE}/documents/upload`, {
            method: 'POST',
            body: formData,
        });
        return handleResponse(response);
    },

    async listMeetingDocuments(meetingId: string): Promise<Document[]> {
        const response = await fetch(`${API_BASE}/documents/meeting/${meetingId}`);
        return handleResponse(response);
    },

    async listPersonaDocuments(personaId: string): Promise<Document[]> {
        const response = await fetch(`${API_BASE}/documents/persona/${personaId}`);
        return handleResponse(response);
    },

    async listStackDocuments(stackId: string): Promise<Document[]> {
        const response = await fetch(`${API_BASE}/documents/stack/${stackId}`);
        return handleResponse(response);
    },

    async getDocument(documentId: string): Promise<Document> {
        const response = await fetch(`${API_BASE}/documents/${documentId}`);
        return handleResponse(response);
    },

    async deleteDocument(documentId: string): Promise<{ message: string; id: string }> {
        const response = await fetch(`${API_BASE}/documents/${documentId}`, {
            method: 'DELETE',
        });
        return handleResponse(response);
    },

    async searchDocuments(
        query: string,
        meetingId?: string,
        personaId?: string,
        stackIds?: string[],
        limit: number = 5
    ): Promise<DocumentSearchResponse> {
        const response = await fetch(`${API_BASE}/documents/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                meeting_id: meetingId,
                persona_id: personaId,
                stack_ids: stackIds,
                limit,
            }),
        });
        return handleResponse(response);
    },
};

// ============== KNOWLEDGE STACKS TYPES ==============

export interface KnowledgeStack {
    id: string;
    name: string;
    description: string | null;
    user_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface KnowledgeStackCreate {
    name: string;
    description?: string;
    user_id?: string;
}

export interface KnowledgeStackUpdate {
    name?: string;
    description?: string;
}

export interface KnowledgeStackListResponse {
    stacks: KnowledgeStack[];
    total: number;
}

// ============== KNOWLEDGE STACKS API ==============

export const knowledgeStacksApi = {
    async listStacks(userId?: string): Promise<KnowledgeStackListResponse> {
        const params = new URLSearchParams();
        if (userId) params.append('user_id', userId);
        const response = await fetch(`${API_BASE}/knowledge_stacks?${params}`);
        return handleResponse(response);
    },

    async getStack(stackId: string): Promise<KnowledgeStack> {
        const response = await fetch(`${API_BASE}/knowledge_stacks/${stackId}`);
        return handleResponse(response);
    },

    async createStack(data: KnowledgeStackCreate): Promise<KnowledgeStack> {
        const response = await fetch(`${API_BASE}/knowledge_stacks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleResponse(response);
    },

    async updateStack(stackId: string, data: KnowledgeStackUpdate): Promise<KnowledgeStack> {
        const response = await fetch(`${API_BASE}/knowledge_stacks/${stackId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return handleResponse(response);
    },

    async deleteStack(stackId: string): Promise<void> {
        const response = await fetch(`${API_BASE}/knowledge_stacks/${stackId}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || `API Error: ${response.status}`);
        }
    }
};
