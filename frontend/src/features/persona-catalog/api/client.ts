/**
 * HTTP client for persona catalog reads (spec-05).
 *
 * The roster screen reads personas through this capability; prompts and
 * persona editing stay with the roster screens that own them (spec-06) and
 * are not part of this slice.
 */
import { requestJson } from '@/shared/api/transport';
import { requirePersonaListResponse, type PersonaListResponse } from './decoders';

export const personaClient = {
    list(init?: { signal?: AbortSignal }): Promise<PersonaListResponse> {
        return requestJson('/personas', { query: { include_defaults: true }, ...init }).then(
            (body) => requirePersonaListResponse(body, '/personas')
        );
    },
};
