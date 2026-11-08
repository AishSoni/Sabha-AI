/**
 * In-memory persona request transport (spec-24).
 *
 * The demo does not reimplement the persona client. It binds the same
 * `createPersonaClient` implementation to this transport, which speaks the
 * same request paths and returns the same wire shapes as the live API.
 */
import type { LocalOutcome, WorkspaceLocalState } from '@/features/demo-workspace';
import type { PersonaRequest, PersonaRequestInit } from '../model/client';
import type { PersonaCreateInput, PersonaUpdateInput } from '../model/types';
import {
    activateRevision,
    createPersona,
    deletePersona,
    personaListWire,
    personaWire,
    revisionWire,
    saveRevision,
    updatePersona,
    type LocalCatalogResult,
} from './state';

export interface LocalPersonaTransportOptions {
    getState: () => WorkspaceLocalState;
    commit: (
        update: (current: WorkspaceLocalState) => WorkspaceLocalState
    ) => LocalOutcome<void>;
    getEpoch: () => number;
    isCurrentEpoch: (epoch: number) => boolean;
    baseInstructions: string | null;
    idFactory?: () => string;
    clock?: () => string;
    wait?: () => Promise<void>;
}

export class LocalPersonaError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(message: string, status: number, code: string) {
        super(message);
        this.name = 'LocalPersonaError';
        this.status = status;
        this.code = code;
    }
}

function defaultId(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
        return cryptoApi.randomUUID();
    }
    return `local-${Math.random().toString(36).slice(2)}`;
}

function defaultClock(): string {
    return new Date().toISOString();
}

function resetError(): LocalPersonaError {
    return new LocalPersonaError(
        'This workspace was reset; the change was discarded.',
        409,
        'workspace_reset'
    );
}

function abortError(): Error {
    if (typeof DOMException === 'function') {
        return new DOMException('The request was aborted.', 'AbortError');
    }
    const error = new Error('The request was aborted.');
    error.name = 'AbortError';
    return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw abortError();
}

function pathParts(path: string): string[] {
    return path
        .split('?')[0]!
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));
}

export function createLocalPersonaRequest(
    options: LocalPersonaTransportOptions
): PersonaRequest {
    const idFactory = options.idFactory ?? defaultId;
    const clock = options.clock ?? defaultClock;
    const wait = options.wait ?? (() => Promise.resolve());

    function apply<T>(
        mutation: (current: WorkspaceLocalState) => LocalCatalogResult<T>
    ): T {
        const holder: {
            failure: Extract<LocalCatalogResult<T>, { ok: false }> | null;
            value: T | null;
        } = { failure: null, value: null };
        const outcome = options.commit((current) => {
            const result = mutation(current);
            if (!result.ok) {
                holder.failure = result;
                return current;
            }
            holder.value = result.value;
            return result.state;
        });
        if (!outcome.ok) throw resetError();
        if (holder.failure) {
            throw new LocalPersonaError(
                holder.failure.message,
                holder.failure.status,
                holder.failure.code
            );
        }
        return holder.value as T;
    }

    function findPersona(state: WorkspaceLocalState, personaId: string) {
        return state.personas.find((persona) => persona.personaId === personaId);
    }

    return async function request<T>(
        path: string,
        init: PersonaRequestInit = {}
    ): Promise<T> {
        const epoch = options.getEpoch();
        if (!options.isCurrentEpoch(epoch)) throw resetError();
        await wait();
        throwIfAborted(init.signal);
        if (!options.isCurrentEpoch(epoch)) throw resetError();

        const method = init.method ?? 'GET';
        const parts = pathParts(path);
        const state = options.getState();

        if (parts.length === 1 && parts[0] === 'personas') {
            if (method === 'GET') {
                if (!options.isCurrentEpoch(epoch)) throw resetError();
                return personaListWire(state) as T;
            }
            if (method === 'POST') {
                const created = apply((current) =>
                    createPersona(current, init.body as PersonaCreateInput, {
                        idFactory,
                        clock,
                    })
                );
                return personaWire(created.persona) as T;
            }
        }

        if (parts.length === 2 && parts[0] === 'personas') {
            const personaId = parts[1]!;
            if (method === 'GET') {
                const persona = findPersona(state, personaId);
                if (!persona) {
                    throw new LocalPersonaError('Persona not found.', 404, 'not_found');
                }
                return personaWire(persona) as T;
            }
            if (method === 'PUT') {
                const updated = apply((current) =>
                    updatePersona(
                        current,
                        personaId,
                        init.body as PersonaUpdateInput
                    )
                );
                return personaWire(updated.persona) as T;
            }
            if (method === 'DELETE') {
                apply((current) => deletePersona(current, personaId));
                return {} as T;
            }
        }

        if (
            parts.length === 3 &&
            parts[0] === 'personas' &&
            parts[2] === 'prompts'
        ) {
            const personaId = parts[1]!;
            if (method === 'GET') {
                const persona = findPersona(state, personaId);
                if (!persona) {
                    throw new LocalPersonaError('Persona not found.', 404, 'not_found');
                }
                return persona.revisions.map((revision, index) =>
                    revisionWire(persona, revision, index)
                ) as T;
            }
            if (method === 'POST') {
                const body = init.body as { content?: string } | undefined;
                const saved = apply((current) =>
                    saveRevision(current, personaId, body?.content ?? '', {
                        idFactory,
                        clock,
                    })
                );
                return revisionWire(
                    saved.persona,
                    saved.revision,
                    saved.persona.revisions.length - 1
                ) as T;
            }
        }

        if (
            parts.length === 5 &&
            parts[0] === 'personas' &&
            parts[2] === 'prompts' &&
            parts[4] === 'activate' &&
            method === 'POST'
        ) {
            const personaId = parts[1]!;
            const version = Number(parts[3]);
            apply((current) => activateRevision(current, personaId, version));
            return {} as T;
        }

        throw new LocalPersonaError(
            `Unsupported local persona request: ${method} ${path}`,
            404,
            'not_found'
        );
    };
}
