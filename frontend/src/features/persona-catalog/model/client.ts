/**
 * Transport-bound persona catalog client (spec-06).
 *
 * The live app binds this factory to `requestLiveJson`; the demo binds the
 * same implementation to an in-memory request transport. Only the transport
 * differs — paths, query parameters, bodies, response decoding, and command
 * semantics stay identical.
 */
import type { JsonRequestInit } from '@/shared/api/transport';
import { requireArray } from '@/shared/api/decode';
import {
    decodePersona,
    decodePromptRevision,
    requirePersonaListResponse,
    type Persona,
    type PersonaCreateInput,
    type PersonaListResponse,
    type PersonaUpdateInput,
    type PromptRevision,
} from './types';

export type PersonaRequestInit = Omit<JsonRequestInit, 'fetchImpl'>;

/** A request seam matching the shared JSON transport, minus the fetch hook. */
export type PersonaRequest = <T>(path: string, init?: PersonaRequestInit) => Promise<T>;

export interface PersonaCatalogClient {
    list(init?: { signal?: AbortSignal; userId?: string; includeDefaults?: boolean }): Promise<PersonaListResponse>;
    get(personaId: string, init?: { signal?: AbortSignal }): Promise<Persona>;
    create(data: PersonaCreateInput, init?: { signal?: AbortSignal }): Promise<Persona>;
    update(personaId: string, data: PersonaUpdateInput, init?: { signal?: AbortSignal }): Promise<Persona>;
    delete(personaId: string, init?: { signal?: AbortSignal }): Promise<void>;
    listPromptVersions(personaId: string, init?: { signal?: AbortSignal }): Promise<PromptRevision[]>;
    createPromptVersion(personaId: string, content: string, init?: { signal?: AbortSignal }): Promise<PromptRevision>;
    activatePromptVersion(personaId: string, version: number, init?: { signal?: AbortSignal }): Promise<void>;
}

export function createPersonaClient(request: PersonaRequest): PersonaCatalogClient {
    return {
        list(init?: { signal?: AbortSignal; userId?: string; includeDefaults?: boolean }): Promise<PersonaListResponse> {
            const query: Record<string, string | boolean> = {
                include_defaults: init?.includeDefaults ?? true,
            };
            if (init?.userId) query.user_id = init.userId;
            return request('/personas', { query, ...init }).then((body) =>
                requirePersonaListResponse(body, '/personas')
            );
        },

        get(personaId: string, init?: { signal?: AbortSignal }): Promise<Persona> {
            return request(`/personas/${personaId}`, { ...init }).then((body) =>
                decodePersona(body, `/personas/${personaId}`)
            );
        },

        create(data: PersonaCreateInput, init?: { signal?: AbortSignal }): Promise<Persona> {
            return request('/personas', { method: 'POST', body: data, ...init }).then((body) =>
                decodePersona(body, '/personas')
            );
        },

        update(personaId: string, data: PersonaUpdateInput, init?: { signal?: AbortSignal }): Promise<Persona> {
            return request(`/personas/${personaId}`, { method: 'PUT', body: data, ...init }).then((body) =>
                decodePersona(body, `/personas/${personaId}`)
            );
        },

        async delete(personaId: string, init?: { signal?: AbortSignal }): Promise<void> {
            await request(`/personas/${personaId}`, { method: 'DELETE', ...init });
        },

        listPromptVersions(personaId: string, init?: { signal?: AbortSignal }): Promise<PromptRevision[]> {
            return request(`/personas/${personaId}/prompts`, { ...init }).then((body) =>
                requireArray(body, `/personas/${personaId}/prompts`, (item, childPath) =>
                    decodePromptRevision(item, childPath)
                )
            );
        },

        createPromptVersion(
            personaId: string,
            content: string,
            init?: { signal?: AbortSignal }
        ): Promise<PromptRevision> {
            return request(`/personas/${personaId}/prompts`, {
                method: 'POST',
                body: { content },
                ...init,
            }).then((body) => decodePromptRevision(body, `/personas/${personaId}/prompts`));
        },

        async activatePromptVersion(
            personaId: string,
            version: number,
            init?: { signal?: AbortSignal }
        ): Promise<void> {
            await request(`/personas/${personaId}/prompts/${version}/activate`, {
                method: 'POST',
                ...init,
            });
        },
    };
}
