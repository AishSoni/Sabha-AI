/**
 * Typed HTTP client for meeting records (spec-05).
 *
 * Built on the shared transport: no-sign-in requests, AbortSignal
 * propagation, structured ApiError failures, and breadcrumb-checked
 * decoding. The client knows nothing about query keys or feature stores.
 */
import { requireArray } from '@/shared/api/decode';
import { requestJson } from '@/shared/api/transport';
import { decodeMeeting, decodeMeetingWithParticipants, type Meeting, type MeetingWithParticipants } from './decoders';

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
};
