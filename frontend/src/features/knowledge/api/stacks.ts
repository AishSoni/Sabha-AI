/**
 * HTTP client for knowledge-stack reads and commands (spec-09).
 *
 * The roster screens pick the stacks a persona may query; the read lives in
 * the knowledge feature so persona-catalog consumes it through the feature
 * root barrel, never through the legacy facade.
 */
import { requestLiveJson } from '@/shared/access';
import { decodeObject, optionalString, requireArray, requireNumber, requireString } from '@/shared/api/decode';

export interface KnowledgeStack {
    id: string;
    name: string;
    description: string | null;
    user_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface KnowledgeStackListResponse {
    stacks: KnowledgeStack[];
    total: number;
}

export interface KnowledgeStackInput {
    name: string;
    description?: string;
    user_id?: string;
}

export interface KnowledgeStackUpdate {
    name?: string;
    description?: string;
}

function decodeStack(value: unknown, path: string): KnowledgeStack {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        name: requireString(record.name, `${path}.name`),
        description: optionalString(record.description, `${path}.description`) ?? null,
        user_id: optionalString(record.user_id, `${path}.user_id`) ?? null,
        created_at: requireString(record.created_at, `${path}.created_at`),
        updated_at: requireString(record.updated_at, `${path}.updated_at`),
    };
}

function decodeStackListResponse(value: unknown, path: string): KnowledgeStackListResponse {
    const record = decodeObject(value, path);
    return {
        stacks: requireArray(record.stacks, `${path}.stacks`, (item, childPath) =>
            decodeStack(item, childPath)
        ),
        total: requireNumber(record.total, `${path}.total`),
    };
}

export const stackClient = {
    list(init?: { signal?: AbortSignal; userId?: string }): Promise<KnowledgeStackListResponse> {
        const query = init?.userId ? { user_id: init.userId } : undefined;
        return requestLiveJson('/knowledge_stacks', { query, ...init }).then((body) =>
            decodeStackListResponse(body, '/knowledge_stacks')
        );
    },

    get(stackId: string, init?: { signal?: AbortSignal }): Promise<KnowledgeStack> {
        return requestLiveJson(`/knowledge_stacks/${stackId}`, init).then((body) =>
            decodeStack(body, `/knowledge_stacks/${stackId}`)
        );
    },

    create(input: KnowledgeStackInput, init?: { signal?: AbortSignal }): Promise<KnowledgeStack> {
        return requestLiveJson('/knowledge_stacks', { method: 'POST', body: input, ...init }).then((body) =>
            decodeStack(body, '/knowledge_stacks')
        );
    },

    update(
        stackId: string,
        input: KnowledgeStackUpdate,
        init?: { signal?: AbortSignal }
    ): Promise<KnowledgeStack> {
        return requestLiveJson(`/knowledge_stacks/${stackId}`, {
            method: 'PUT',
            body: input,
            ...init,
        }).then((body) => decodeStack(body, `/knowledge_stacks/${stackId}`));
    },

    delete(stackId: string, init?: { signal?: AbortSignal }): Promise<void> {
        return requestLiveJson(`/knowledge_stacks/${stackId}`, { method: 'DELETE', ...init }).then(
            () => undefined
        );
    },
};
