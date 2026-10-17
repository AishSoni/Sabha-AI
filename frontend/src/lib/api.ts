/**
 * Sabha API Client
 * Handles all backend communication
 */

import {
    createSequenceDedup,
    createSseParser,
    normalizeEvent,
    type NormalizeContext,
    type TurnStreamEvent,
} from './turn-events';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

/** Typed server error: preserves status/conflict codes across the UI. */
export class ApiError extends Error {
    status: number;
    code: string;
    retryable: boolean;

    constructor(status: number, code: string, message: string, retryable = false) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.retryable = retryable;
    }
}

function toApiError(status: number, body: unknown): ApiError {
    const detail =
        (typeof body === 'object' && body !== null && 'detail' in body
            ? String((body as Record<string, unknown>).detail)
            : '') || `API Error: ${status}`;
    if (status === 401) return new ApiError(status, 'unauthenticated', detail, false);
    if (status === 404) return new ApiError(status, 'not_found', detail, false);
    if (status === 409) return new ApiError(status, detail, detail, false);
    if (status === 422) return new ApiError(status, 'validation', detail, false);
    if (status === 429) return new ApiError(status, 'quota', detail, true);
    if (status === 503) return new ApiError(status, 'unavailable', detail, true);
    return new ApiError(status, 'request_failed', detail, status >= 500);
}

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

/** Pending user message waiting behind the running turn (FIFO). */
export interface QueueEntry {
    entryId: string;
    meetingId: string | null;
    /** FIFO position; backend `seq` (SQL) — `order` accepted as alias. */
    position: number | null;
    content: string;
    revision: number;
    state: 'pending' | 'dispatched' | 'removed' | string;
    messageId: string | null;
}

/** Normalize backend queue payloads (entry_id/id, seq/order variants). */
export function asQueueEntry(raw: unknown): QueueEntry {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const entryId = typeof r.entry_id === 'string' ? r.entry_id : typeof r.id === 'string' ? r.id : '';
    const position =
        typeof r.seq === 'number' ? r.seq : typeof r.order === 'number' ? r.order : typeof r.position === 'number' ? r.position : null;
    return {
        entryId,
        meetingId: typeof r.meeting_id === 'string' ? r.meeting_id : null,
        position,
        content: typeof r.content === 'string' ? r.content : '',
        revision: typeof r.revision === 'number' ? r.revision : 1,
        state: typeof r.state === 'string' ? r.state : 'pending',
        messageId: typeof r.message_id === 'string' ? r.message_id : null,
    };
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw toApiError(response.status, error);
    }
    return response.json();
}

function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Trusted-actor attribution (CONTRACTS section 1: identity comes from the
 * transport, never the body).
 *
 * - Demo sessions attribute to the fixed demo owner so the shared ownership
 *   check passes for demo-created meetings (bookkeeping identity, not auth).
 * - Normal use carries a stable anonymous local identity. This is NOT
 *   authentication: it only gives normal meetings an owner for their own
 *   reads/writes (B-05 is withdrawn; no accounts are ever created).
 */
export const DEMO_ACTOR_ID = 'demo-visitor';
const LOCAL_ACTOR_ID = 'local-dev';

export function authHeaders(): Record<string, string> {
    let identity = LOCAL_ACTOR_ID;
    try {
        const token = sessionStorage.getItem('sabha.demo.sessionToken');
        const demoMeeting = sessionStorage.getItem('sabha.demo.meetingId');
        // Demo actor carries THREE signals: pinned meeting id, the legacy
        // identifer token ('real-...' before recorded meeting pinning), and
        // any stored raw credential (session exists). All resolve to the
        // fixed demo owner sharing real ownership bookkeeping.
        if (demoMeeting || (token && token.startsWith('real-')) || token) identity = DEMO_ACTOR_ID;
    } catch {
        /* storage unavailable -> local identity */
    }
    return { Authorization: `Bearer ${identity}` };
}

/**
 * True when the URL's meeting was bootstrapped by the demo walkthrough
 * (sessions page marks sessionStorage before routing into the room).
 */
export function isDemoSessionFor(meetingId: string): boolean {
    try {
        if (sessionStorage.getItem('sabha.demo.meetingId') === meetingId) return true;
        return sessionStorage.getItem('sabha.demo.sessionToken') === `real-${meetingId}`;
    } catch {
        return false;
    }
}

export interface DemoRecordedTurnStart {
    turn_id: string;
    meeting_id: string;
    participant_id: string;
    participant_name: string;
    action_id: string;
    stage?: string | null;
    events_url: string;
    recorded_analysis: boolean;
    approval_status: string;
    disclosure: string;
}

interface TurnStreamOutcome {
    terminal: TurnStreamEvent | null;
    eofWithoutTerminal: boolean;
    aborted: boolean;
}

/** Shared normalized SSE consumption for both turn subscription paths. */
async function consumeTurnStream(
    response: Response,
    args: { meetingId: string; signal: AbortSignal; onEvent: (event: TurnStreamEvent) => void; initialTurnId?: string },
): Promise<TurnStreamOutcome> {
    const { meetingId, signal, onEvent, initialTurnId } = args;
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let seq = 0;
    let tools = 0;
    let turnId: string | null = initialTurnId ?? null;
    const ctx: NormalizeContext = {
        meetingId,
        turnId,
        nextSequence: () => ++seq,
        nextExecutionId: (name: string) => `legacy:${meetingId}:${++tools}:${name}`,
    };
    const isDuplicate = createSequenceDedup();
    let terminal: TurnStreamEvent | null = null;
    let aborted = false;
    let parseErrors = 0;

    const parser = createSseParser({
        onFrame: (frame) => {
            if (signal.aborted || !frame.data) return;
            let raw: unknown;
            try {
                raw = JSON.parse(frame.data);
            } catch (e) {
                parseErrors += 1;
                console.error('[SSE Parse Error]', frame.data.slice(0, 100), e);
                return;
            }
            // Capture v2 lifecycle markers for identity; they carry no UI content.
            if (
                typeof raw === 'object' && raw !== null &&
                (raw as Record<string, unknown>).version === 2 &&
                (raw as Record<string, unknown>).type === 'turn_started'
            ) {
                const id = (raw as Record<string, unknown>).turn_id;
                if (typeof id === 'string') {
                    turnId = id;
                    ctx.turnId = id;
                }
                return;
            }
            const event = normalizeEvent(raw, ctx);
            if (!event) return;
            if (isDuplicate(event.sequence)) return;
            if (event.kind === 'terminal') terminal = event;
            onEvent(event);
        },
    });

    try {
        while (true) {
            let read: ReadableStreamReadResult<Uint8Array>;
            try {
                read = await reader.read();
            } catch (err) {
                if (isAbortError(err) || signal.aborted) {
                    aborted = true;
                    break;
                }
                throw err;
            }
            if (read.done) break;
            if (signal.aborted) {
                aborted = true;
                break;
            }
            parser.feed(read.value);
        }
    } finally {
        parser.flush();
        reader.releaseLock();
    }

    if (signal.aborted) aborted = true;
    void parseErrors;
    return { terminal, eofWithoutTerminal: terminal === null && !aborted, aborted };
}

export const api = {
    // Meetings
    async createMeeting(name: string, agenda: string = '', personaIds?: string[]): Promise<MeetingWithParticipants> {
        const response = await fetch(`${API_BASE}/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ name, agenda, persona_ids: personaIds }),
        });
        return handleResponse(response);
    },

    async listMeetings(): Promise<Meeting[]> {
        const response = await fetch(`${API_BASE}/meetings`, { headers: authHeaders() });
        return handleResponse(response);
    },

    async getMeeting(meetingId: string): Promise<MeetingWithParticipants> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}`, { headers: authHeaders() });
        return handleResponse(response);
    },

    async archiveMeeting(meetingId: string): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/archive`, {
            method: 'POST',
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    async unarchiveMeeting(meetingId: string): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/unarchive`, {
            method: 'POST',
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    async deleteMeeting(meetingId: string): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    // Messages
    async sendUserMessage(meetingId: string, content: string): Promise<Message> {
        const result = await api.submitMessage(meetingId, content);
        if (result.queued) {
            throw new ApiError(202, 'queued', 'Message queued behind the running turn', true);
        }
        return result.message;
    },

    /**
     * Discriminated submission: 201 commits immediately when the meeting
     * is idle, 202 queues FIFO behind the running turn. Callers must
     * handle both — a queued message is not yet in the transcript.
     */
    async submitMessage(
        meetingId: string,
        content: string,
        idempotencyKey?: string,
    ): Promise<{ queued: false; message: Message } | { queued: true; entry: QueueEntry }> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ content, ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) }),
        });
        if (response.status === 201) return { queued: false, message: (await response.json()) as Message };
        if (response.status === 202) {
            const body = (await response.json()) as { entry: unknown };
            return { queued: true, entry: asQueueEntry(body.entry) };
        }
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw toApiError(response.status, error);
    },

    async getQueue(meetingId: string): Promise<QueueEntry[]> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/queue`, { headers: authHeaders() });
        const body = await handleResponse<{ entries: unknown[] }>(response);
        return (body.entries ?? []).map(asQueueEntry);
    },

    async editQueueEntry(
        meetingId: string,
        entryId: string,
        content: string,
        expectedRevision: number,
    ): Promise<QueueEntry> {
        const response = await fetch(
            `${API_BASE}/meetings/${meetingId}/queue/${entryId}?expected_revision=${expectedRevision}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ content }),
            },
        );
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw toApiError(response.status, error);
        }
        return asQueueEntry(await response.json());
    },

    async removeQueueEntry(meetingId: string, entryId: string, expectedRevision: number): Promise<void> {
        const response = await fetch(
            `${API_BASE}/meetings/${meetingId}/queue/${entryId}?expected_revision=${expectedRevision}`,
            { method: 'DELETE', headers: authHeaders() },
        );
        if (response.status === 204) return;
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw toApiError(response.status, error);
        }
    },

    // AI Turns
    async executeTurn(meetingId: string, participantId: string): Promise<TurnResponse> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ participant_id: participantId }),
        });
        return handleResponse(response);
    },

    // AI Turns (Streaming compatibility wrapper over the shared SSE parser.
    // Retirement policy: new flows must use subscribeTurnEvents (abortable,
    // deduplicated, EOF-without-terminal reporting). streamTurn is retained
    // only for existing callers/tests and yields the legacy StreamEvent shape.
    async *streamTurn(
        meetingId: string,
        participantId: string,
        opts?: { signal?: AbortSignal },
    ): AsyncGenerator<StreamEvent> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/turn/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ participant_id: participantId }),
            signal: opts?.signal,
        }).catch((err) => {
            if (isAbortError(err)) return null;
            throw err;
        });
        if (!response) return;

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw toApiError(response.status, error);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const pending: string[] = [];
        const parser = createSseParser({
            onFrame: (frame) => {
                if (frame.data) pending.push(frame.data);
            },
        });
        function* drain(): Generator<StreamEvent> {
            while (pending.length > 0) {
                const payload = pending.shift() as string;
                try {
                    yield JSON.parse(payload) as StreamEvent;
                } catch (e) {
                    console.error('[SSE Parse Error]', payload.slice(0, 100), e);
                }
            }
        }

        try {
            while (true) {
                const { done, value } = await reader.read().catch((err) => {
                    if (isAbortError(err)) return { done: true as const, value: undefined };
                    throw err;
                });
                if (done) break;
                if (value) parser.feed(value);
                yield* drain();
            }
            parser.flush();
            yield* drain();
        } finally {
            reader.releaseLock();
        }
    },

    /**
     * Abortable turn subscription over normalized events. Deduplicates
     * replayed delivery by sequence; reports EOF without terminal so the
     * caller can show reconnecting and reconcile against GET meeting.
     * Aborting the signal stops the subscription only — server execution,
     * if any, is unaffected (navigation is not cancellation).
     */
    async subscribeTurnEvents(args: {
        meetingId: string;
        participantId: string;
        signal: AbortSignal;
        onEvent: (event: TurnStreamEvent) => void;
    }): Promise<{ terminal: TurnStreamEvent | null; eofWithoutTerminal: boolean; aborted: boolean }> {
        const { meetingId, participantId, signal, onEvent } = args;
        let response: Response;
        try {
            response = await fetch(`${API_BASE}/meetings/${meetingId}/turn/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ participant_id: participantId }),
                signal,
            });
        } catch (err) {
            if (isAbortError(err)) return { terminal: null, eofWithoutTerminal: false, aborted: true };
            throw err;
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw toApiError(response.status, error);
        }

        return consumeTurnStream(response, { meetingId, signal, onEvent });
    },

    /**
     * Demo recorded turn trigger: asks the server to start a SEALed journey
     * action (server-picked participant, recorded provider, seed assertions)
     * through the SHARED TurnEngine. Returns the normal turn identity so the
     * room can subscribe the standard turn journal.
     */
    async startDemoRecordedTurn(args: {
        meetingId: string;
        actionId?: string;
        idempotencyKey?: string;
    }): Promise<DemoRecordedTurnStart> {
        const response = await fetch(`${API_BASE}/v2/demo/recorded-turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meeting_id: args.meetingId,
                action_id: args.actionId ?? 'submit_bond_question',
                idempotency_key: args.idempotencyKey,
            }),
        }).catch((err) => {
            if (isAbortError(err)) return null;
            throw err;
        });
        if (!response) throw new DOMException('Aborted', 'AbortError');
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw toApiError(response.status, error);
        }
        return response.json();
    },

    /**
     * Subscribe the standard turn journal by turn id (GET .../turns/{id}/events).
     * Used by the recorded demo turn after POST .../recorded-turn returns the
     * turn identity; framing/ordering/dedup identical to subscribeTurnEvents.
     */
    async subscribeTurnJournal(args: {
        meetingId: string;
        turnId: string;
        signal: AbortSignal;
        onEvent: (event: TurnStreamEvent) => void;
        after?: number;
    }): Promise<{ terminal: TurnStreamEvent | null; eofWithoutTerminal: boolean; aborted: boolean }> {
        const { meetingId, turnId, signal, onEvent, after = 0 } = args;
        let response: Response;
        try {
            response = await fetch(
                `${API_BASE}/meetings/turns/${turnId}/events?after=${after}`,
                { headers: authHeaders(), signal },
            );
        } catch (err) {
            if (isAbortError(err)) return { terminal: null, eofWithoutTerminal: false, aborted: true };
            throw err;
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw toApiError(response.status, error);
        }
        return consumeTurnStream(response, {
            meetingId,
            signal,
            onEvent,
            initialTurnId: turnId,
        });
    },

    // Conflicts
    async getDisagreements(meetingId: string): Promise<Disagreement[]> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/disagreements`, { headers: authHeaders() });
        return handleResponse(response);
    },

    async getConsensus(meetingId: string): Promise<Consensus[]> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/consensus`, { headers: authHeaders() });
        return handleResponse(response);
    },

    // Participant templates
    async getParticipantTemplates(): Promise<Array<{ name: string; role: string; system_prompt: string; color: string }>> {
        const response = await fetch(`${API_BASE}/participants/templates`, { headers: authHeaders() });
        return handleResponse(response);
    },

    // Context stats
    async getContextStats(meetingId: string): Promise<ContextStats> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/context-stats`, { headers: authHeaders() });
        return handleResponse(response);
    },

    // End meeting
    async endMeeting(meetingId: string, forceEnd: boolean): Promise<EndMeetingResponse> {
        const response = await fetch(`${API_BASE}/meetings/${meetingId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ force_end: forceEnd }),
        });
        return handleResponse(response);
    },

    /**
     * Shared ending attempt (202 journal workflow). Votes and the summary are
     * produced by the server and streamed over the ending journal; the same
     * endpoint serves demo meetings with recorded ballots and brief.
     * Duplicate idempotency keys return the prior attempt identity.
     */
    async startEndingAttempt(args: {
        meetingId: string;
        forceEnd?: boolean;
        idempotencyKey?: string;
    }): Promise<EndingAttemptStart> {
        const response = await fetch(`${API_BASE}/meetings/${args.meetingId}/ending-attempts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ force_end: args.forceEnd ?? false }),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw toApiError(response.status, error);
        }
        return response.json();
    },

    /** Authoritative ending attempt state (recovery view after a restart). */
    async getEndingAttempt(attemptId: string): Promise<EndingAttemptView> {
        const response = await fetch(`${API_BASE}/meetings/ending-attempts/${attemptId}`, {
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    /**
     * Replay + live subscribe of the shared ending journal by attempt id.
     * Dedup by sequence like the turn journal; EOF without a terminal event is
     * reported so the caller can reconcile via getEndingAttempt — EOF never
     * implies completion in either journal.
     */
    async subscribeEndingJournal(args: {
        attemptId: string;
        signal: AbortSignal;
        onEvent: (event: EndingJournalEvent) => void;
    }): Promise<{ terminal: EndingJournalEvent | null; eofWithoutTerminal: boolean; aborted: boolean }> {
        const { attemptId, signal, onEvent } = args;
        const dedup = createSequenceDedup();
        let terminal: EndingJournalEvent | null = null;
        const parser = createSseParser({
            onFrame(frame) {
                const envelope = parseEndingEnvelope(frame.data);
                if (!envelope) return;
                const fallbackType = typeof frame.event === 'string' ? frame.event : null;
                const event = endingEventFrom(envelope, fallbackType);
                if (!event) return;
                const sequence = event.sequence;
                if (sequence !== undefined && dedup(sequence)) return;
                if (event.type === 'ending_completed' || event.type === 'ending_failed') terminal = event;
                onEvent(event);
            },
        });

        let response: Response;
        try {
            response = await fetch(`${API_BASE}/meetings/ending-attempts/${attemptId}/events?after=0`, {
                headers: authHeaders(),
                signal,
            });
        } catch (err) {
            if (isAbortError(err)) return { terminal: null, eofWithoutTerminal: false, aborted: true };
            throw err;
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw toApiError(response.status, error);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new ApiError(0, 'unavailable', 'ending stream has no body', false);
        let eof = false;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    eof = true;
                    break;
                }
                parser.feed(value as Uint8Array);
            }
        } catch (err) {
            if (isAbortError(err)) return { terminal, eofWithoutTerminal: false, aborted: true };
            throw err;
        } finally {
            reader.releaseLock();
        }
        parser.flush();
        return { terminal, eofWithoutTerminal: eof && !terminal, aborted: false };
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

// Ending-attempt journal types (shared ending workflow, version-2 SSE).
export interface EndingAttemptStart {
    attempt_id: string;
    meeting_id: string;
    state: string;
    duplicate: boolean;
    events_url: string;
}

export interface EndingAttemptView {
    attempt_id: string;
    meeting_id: string;
    state: string;
    outcome: string;
    summary: string | null;
    usage: Record<string, number>;
    votes: Array<Record<string, unknown>>;
}

interface RawEndingEnvelope {
    version?: number;
    type?: string;
    sequence?: number;
    ending_attempt_id?: string;
    [key: string]: unknown;
}

export interface EndingJournalEvent {
    type: string;
    /** The inner `data` payload of the v2 envelope (e.g. vote fields). */
    data: Record<string, unknown>;
    sequence?: number;
    endingAttemptId?: string;
}

function parseEndingEnvelope(data: string | null): RawEndingEnvelope | null {
    if (!data) return null;
    try {
        const parsed = JSON.parse(data) as RawEndingEnvelope | null;
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function endingEventFrom(envelope: RawEndingEnvelope, fallbackType: string | null): EndingJournalEvent | null {
    const type = typeof envelope.type === 'string' ? envelope.type : fallbackType;
    if (!type) return null;
    const rawPayload = envelope.data;
    const payload =
        rawPayload && typeof rawPayload === 'object' ? (rawPayload as Record<string, unknown>) : {};
    const sequence = typeof envelope.sequence === 'number' ? envelope.sequence : undefined;
    return {
        type,
        data: payload,
        sequence,
        endingAttemptId: typeof envelope.ending_attempt_id === 'string' ? envelope.ending_attempt_id : undefined,
    };
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
        const response = await fetch(`${API_BASE}/personas?${params}`, { headers: authHeaders() });
        return handleResponse(response);
    },

    async getPersona(personaId: string): Promise<PersonaWithPrompt> {
        const response = await fetch(`${API_BASE}/personas/${personaId}`, { headers: authHeaders() });
        return handleResponse(response);
    },

    async createPersona(data: PersonaCreate): Promise<PersonaWithPrompt> {
        const response = await fetch(`${API_BASE}/personas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(data),
        });
        return handleResponse(response);
    },

    async updatePersona(personaId: string, data: PersonaUpdate): Promise<PersonaWithPrompt> {
        const response = await fetch(`${API_BASE}/personas/${personaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(data),
        });
        return handleResponse(response);
    },

    async deletePersona(personaId: string): Promise<void> {
        const response = await fetch(`${API_BASE}/personas/${personaId}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || `API Error: ${response.status}`);
        }
    },

    // Prompt versions
    async listPromptVersions(personaId: string): Promise<PromptVersion[]> {
        const response = await fetch(`${API_BASE}/personas/${personaId}/prompts`, {
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    async createPromptVersion(personaId: string, content: string): Promise<PromptVersion> {
        const response = await fetch(`${API_BASE}/personas/${personaId}/prompts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ content }),
        });
        return handleResponse(response);
    },

    async activatePromptVersion(personaId: string, version: number): Promise<void> {
        const response = await fetch(`${API_BASE}/personas/${personaId}/prompts/${version}/activate`, {
            method: 'POST',
            headers: authHeaders(),
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
    api_key?: string;
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
            // Strip browser-supplied secrets: server owns destinations and keys.
            body: JSON.stringify({ provider: request.provider }),
        });
        return handleResponse(response);
    },

    async getPreferences(): Promise<ServerPreferencesResponse> {
        const response = await fetch(`${API_BASE}/settings/preferences`, {
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    async savePreferences(prefs: Partial<ServerPreferences>): Promise<ServerPreferencesResponse> {
        const response = await fetch(`${API_BASE}/settings/preferences`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(prefs),
        });
        return handleResponse(response);
    },

    async getEffective(provider?: string, model?: string): Promise<EffectiveSettingsResponse> {
        const params = new URLSearchParams();
        if (provider) params.append('provider', provider);
        if (model) params.append('model', model);
        const qs = params.toString() ? `?${params}` : '';
        const response = await fetch(`${API_BASE}/settings/effective${qs}`, { headers: authHeaders() });
        return handleResponse(response);
    },
};

export interface ServerPreferences {
    default_provider: string;
    default_model: string;
    default_temperature: number;
    default_max_tokens: number;
    system_ai: SystemAIConfig;
}

export interface ServerPreferencesResponse {
    success: boolean;
    preferences: ServerPreferences;
}

export interface EffectiveSettings {
    provider: string;
    model: string;
    temperature: number;
    max_tokens: number;
    provenance: Record<string, string>;
}

export interface EffectiveSettingsResponse {
    success: boolean;
    effective: EffectiveSettings;
    readiness: { ready: boolean; reason: string };
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
            headers: authHeaders(),
            body: formData,
        });
        return handleResponse(response);
    },

    async listMeetingDocuments(meetingId: string): Promise<Document[]> {
        const response = await fetch(`${API_BASE}/documents/meeting/${meetingId}`, {
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    async listPersonaDocuments(personaId: string): Promise<Document[]> {
        const response = await fetch(`${API_BASE}/documents/persona/${personaId}`, {
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    async listStackDocuments(stackId: string): Promise<Document[]> {
        const response = await fetch(`${API_BASE}/documents/stack/${stackId}`, {
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    async getDocument(documentId: string): Promise<Document> {
        const response = await fetch(`${API_BASE}/documents/${documentId}`, {
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    async deleteDocument(documentId: string): Promise<{ message: string; id: string }> {
        const response = await fetch(`${API_BASE}/documents/${documentId}`, {
            method: 'DELETE',
            headers: authHeaders(),
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
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
        const response = await fetch(`${API_BASE}/knowledge_stacks?${params}`, { headers: authHeaders() });
        return handleResponse(response);
    },

    async getStack(stackId: string): Promise<KnowledgeStack> {
        const response = await fetch(`${API_BASE}/knowledge_stacks/${stackId}`, {
            headers: authHeaders(),
        });
        return handleResponse(response);
    },

    async createStack(data: KnowledgeStackCreate): Promise<KnowledgeStack> {
        const response = await fetch(`${API_BASE}/knowledge_stacks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(data),
        });
        return handleResponse(response);
    },

    async updateStack(stackId: string, data: KnowledgeStackUpdate): Promise<KnowledgeStack> {
        const response = await fetch(`${API_BASE}/knowledge_stacks/${stackId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(data),
        });
        return handleResponse(response);
    },

    async deleteStack(stackId: string): Promise<void> {
        const response = await fetch(`${API_BASE}/knowledge_stacks/${stackId}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || `API Error: ${response.status}`);
        }
    }
};

// ============== PARTICIPANT REFRESH API ==============

export interface RefreshPreviewResponse {
    changed: boolean;
    diff: Record<string, { from: unknown; to: unknown }>;
    expected_persona_revision?: number | null;
}

export const participantsApi = {
    async refreshPreview(
        participantId: string,
        expectedPersonaRevision?: number | null,
    ): Promise<RefreshPreviewResponse> {
        const response = await fetch(`${API_BASE}/participants/${participantId}/refresh-preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ expected_persona_revision: expectedPersonaRevision ?? null }),
        });
        return handleResponse(response);
    },

    async refreshParticipant(
        participantId: string,
        expectedParticipantRevision?: number | null,
        expectedPersonaRevision?: number | null,
    ): Promise<AIParticipant> {
        const response = await fetch(`${API_BASE}/participants/${participantId}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({
                expected_participant_revision: expectedParticipantRevision ?? null,
                expected_persona_revision: expectedPersonaRevision ?? null,
            }),
        });
        return handleResponse(response);
    },
};
