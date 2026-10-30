/**
 * HTTP client for the persona catalog (spec-05 list, spec-06 full surface).
 *
 * Template CRUD, prompt history and activation all ride the module-served
 * routes; bodies mirror the frozen contract snapshot and responses are
 * decoded before they reach the screens.
 */
import { requestLiveJson } from '@/shared/access';
import {
    decodePersona,
    decodePromptRevision,
    requirePersonaListResponse,
    type Persona,
    type PersonaListResponse,
    type PromptRevision,
} from './decoders';
import { requireArray } from '@/shared/api/decode';

export interface PersonaCreateInput {
    name: string;
    subtitle?: string | null;
    color?: string;
    avatar_url?: string | null;
    provider_config?: {
        provider?: string | null;
        model?: string | null;
        temperature?: number | null;
        max_tokens?: number | null;
    } | null;
    system_prompt?: string;
    user_id?: string | null;
    stack_ids?: string[];
}

export interface PersonaUpdateInput {
    name?: string | null;
    subtitle?: string | null;
    color?: string | null;
    avatar_url?: string | null;
    provider_config?: {
        provider?: string | null;
        model?: string | null;
        temperature?: number | null;
        max_tokens?: number | null;
    } | null;
    stack_ids?: string[] | null;
}

export const personaClient = {
    list(init?: { signal?: AbortSignal; userId?: string; includeDefaults?: boolean }): Promise<PersonaListResponse> {
        const query: Record<string, string | boolean> = {
            include_defaults: init?.includeDefaults ?? true,
        };
        if (init?.userId) query.user_id = init.userId;
        return requestLiveJson('/personas', { query, ...init }).then((body) =>
            requirePersonaListResponse(body, '/personas')
        );
    },

    get(personaId: string, init?: { signal?: AbortSignal }): Promise<Persona> {
        return requestLiveJson(`/personas/${personaId}`, { ...init }).then((body) =>
            decodePersona(body, `/personas/${personaId}`)
        );
    },

    create(data: PersonaCreateInput, init?: { signal?: AbortSignal }): Promise<Persona> {
        return requestLiveJson('/personas', { method: 'POST', body: data, ...init }).then((body) =>
            decodePersona(body, '/personas')
        );
    },

    update(personaId: string, data: PersonaUpdateInput, init?: { signal?: AbortSignal }): Promise<Persona> {
        return requestLiveJson(`/personas/${personaId}`, { method: 'PUT', body: data, ...init }).then((body) =>
            decodePersona(body, `/personas/${personaId}`)
        );
    },

    async delete(personaId: string, init?: { signal?: AbortSignal }): Promise<void> {
        await requestLiveJson(`/personas/${personaId}`, { method: 'DELETE', ...init });
    },

    listPromptVersions(personaId: string, init?: { signal?: AbortSignal }): Promise<PromptRevision[]> {
        return requestLiveJson(`/personas/${personaId}/prompts`, { ...init }).then((body) =>
            requireArray(body, `/personas/${personaId}/prompts`, (item, childPath) =>
                decodePromptRevision(item, childPath)
            )
        );
    },

    createPromptVersion(personaId: string, content: string, init?: { signal?: AbortSignal }): Promise<PromptRevision> {
        return requestLiveJson(`/personas/${personaId}/prompts`, {
            method: 'POST',
            body: { content },
            ...init,
        }).then((body) => decodePromptRevision(body, `/personas/${personaId}/prompts`));
    },

    async activatePromptVersion(personaId: string, version: number, init?: { signal?: AbortSignal }): Promise<void> {
        await requestLiveJson(`/personas/${personaId}/prompts/${version}/activate`, {
            method: 'POST',
            ...init,
        });
    },
};
