/**
 * Typed HTTP client for meeting records (spec-05).
 *
 * Built on the shared transport: no-sign-in requests, AbortSignal
 * propagation, structured ApiError failures, and breadcrumb-checked
 * decoding. The client knows nothing about query keys or feature stores.
 */
import { requireArray } from '@/shared/api/decode';
import { requestJson } from '@/shared/api/transport';
import {
    decodeConsensus,
    decodeContextStats,
    decodeDisagreement,
    decodeMeeting,
    decodeMeetingWithParticipants,
    decodeMessage,
    type Consensus,
    type ContextStats,
    type Disagreement,
    type Meeting,
    type MeetingWithParticipants,
    type Message,
} from './decoders';
import type { TurnGenerationSettings } from './turn-client';

export interface MeetingCreateInput {
    name: string;
    agenda: string;
    personaIds: string[];
}

export interface RequestInitOptional {
    signal?: AbortSignal;
}

export const meetingClient = {
    /** Canonical list of meetings (GET /api/meetings). */
    async list(): Promise<Meeting[]> {
        const payload = await requestJson<unknown>('/meetings');
        return requireArray(payload, 'GET /meetings', (item, childPath) => decodeMeeting(item, childPath));
    },

    /** Canonical detail of one meeting (GET /api/meetings/:id). */
    async get(meetingId: string, init: RequestInitOptional = {}): Promise<MeetingWithParticipants> {
        const payload = await requestJson<unknown>(`/meetings/${encodeURIComponent(meetingId)}`, {
            signal: init.signal,
        });
        return decodeMeetingWithParticipants(payload, 'GET /meetings/:id');
    },

    /** Create a meeting command (POST /api/meetings), decoded detail back. */
    async create(input: MeetingCreateInput, init: RequestInitOptional = {}): Promise<MeetingWithParticipants> {
        const payload = await requestJson<unknown>('/meetings', {
            method: 'POST',
            body: {
                name: input.name,
                agenda: input.agenda,
                persona_ids: input.personaIds,
            },
            signal: init.signal,
        });
        return decodeMeetingWithParticipants(payload, 'POST /meetings');
    },

    /** Archive command (POST /api/meetings/:id/archive). */
    async archive(meetingId: string, init: RequestInitOptional = {}): Promise<void> {
        await requestJson<unknown>(`/meetings/${encodeURIComponent(meetingId)}/archive`, {
            method: 'POST',
            signal: init.signal,
        });
    },

    /** Unarchive command (POST /api/meetings/:id/unarchive). */
    async unarchive(meetingId: string, init: RequestInitOptional = {}): Promise<void> {
        await requestJson<unknown>(`/meetings/${encodeURIComponent(meetingId)}/unarchive`, {
            method: 'POST',
            signal: init.signal,
        });
    },

    /** Permanent delete command (DELETE /api/meetings/:id). */
    async remove(meetingId: string, init: RequestInitOptional = {}): Promise<void> {
        await requestJson<unknown>(`/meetings/${encodeURIComponent(meetingId)}`, {
            method: 'DELETE',
            signal: init.signal,
        });
    },

    /** Append one user message (POST /api/meetings/:id/message). */
    async sendMessage(
        meetingId: string,
        content: string,
        init: RequestInitOptional = {}
    ): Promise<Message> {
        const payload = await requestJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/message`,
            { method: 'POST', body: { content }, signal: init.signal }
        );
        return decodeMessage(payload, 'POST /meetings/:id/message');
    },

    /** Read the persisted disagreement ledger (GET /api/meetings/:id/disagreements). */
    async disagreements(
        meetingId: string,
        init: RequestInitOptional = {}
    ): Promise<Disagreement[]> {
        const payload = await requestJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/disagreements`,
            { signal: init.signal }
        );
        return requireArray(payload, 'GET /meetings/:id/disagreements', (item, path) =>
            decodeDisagreement(item, path)
        );
    },

    /** Read the persisted consensus ledger (GET /api/meetings/:id/consensus). */
    async consensus(meetingId: string, init: RequestInitOptional = {}): Promise<Consensus[]> {
        const payload = await requestJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/consensus`,
            { signal: init.signal }
        );
        return requireArray(payload, 'GET /meetings/:id/consensus', (item, path) =>
            decodeConsensus(item, path)
        );
    },

    /** Read token usage statistics (GET /api/meetings/:id/context-stats). */
    async contextStats(
        meetingId: string,
        init: RequestInitOptional = {}
    ): Promise<ContextStats> {
        const payload = await requestJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/context-stats`,
            { signal: init.signal }
        );
        return decodeContextStats(payload, 'GET /meetings/:id/context-stats');
    },

    /**
     * Generate and persist one interim summary (POST /api/meetings/:id/summary).
     * A paid command: callers issue it from explicit user intent only.
     */
    async generateSummary(
        meetingId: string,
        settings?: TurnGenerationSettings,
        init: RequestInitOptional = {}
    ): Promise<Message> {
        const key = settings?.apiKey?.trim();
        const headers = key ? { 'X-Provider-Key': key } : undefined;
        const provider = settings
            ? {
                  ...(settings.provider !== undefined
                      ? { provider: settings.provider }
                      : {}),
                  ...(settings.model !== undefined ? { model: settings.model } : {}),
                  ...(settings.temperature !== undefined
                      ? { temperature: settings.temperature }
                      : {}),
                  ...(settings.maxTokens !== undefined
                      ? { max_tokens: settings.maxTokens }
                      : {}),
                  ...(settings.baseUrl !== undefined
                      ? { base_url: settings.baseUrl }
                      : {}),
              }
            : {};
        const payload = await requestJson<unknown>(
            `/meetings/${encodeURIComponent(meetingId)}/summary`,
            {
                method: 'POST',
                headers,
                body: Object.keys(provider).length > 0 ? { provider } : {},
                signal: init.signal,
            }
        );
        return decodeMessage(payload, 'POST /meetings/:id/summary');
    },
};
