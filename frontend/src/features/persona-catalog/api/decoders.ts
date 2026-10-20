/**
 * Wire decoders for persona catalog records (spec-06).
 *
 * Shapes mirror the frozen backend contract snapshot
 * (frontend/tests/fixtures/openapi.json -> components.schemas.*) — the
 * generated types stay the source of truth and these decoders give the
 * runtime breadcrumb-checked validation the generated types cannot.
 *
 * The template generation carrier is per-field nullable: ``null`` (or an
 * empty provider/model marker) means "inherit at execution start", a
 * recorded number is an explicit value — including a zero temperature.
 */
import { decodeObject, optionalNumber, optionalString, requireArray, requireBoolean, requireNumber, requireString } from '@/shared/api/decode';

/** Per-field nullable generation carrier (null = inherit). */
export interface PersonaGenerationSettings {
    provider: string | null;
    model: string | null;
    temperature: number | null;
    max_tokens: number | null;
}

export interface Persona {
    id: string;
    name: string;
    subtitle: string | null;
    color: string;
    avatar_url: string | null;
    provider_config: PersonaGenerationSettings;
    is_default: boolean;
    stack_ids?: string[];
    user_id: string | null;
    created_at: string;
    updated_at: string;
    active_prompt: string | null;
    active_prompt_version: number | null;
}

export interface PersonaListResponse {
    personas: Persona[];
    total: number;
}

export interface PromptRevision {
    id: string;
    persona_id: string;
    version: number;
    content: string;
    is_active: boolean;
    created_at: string;
}

function decodeGenerationSettings(value: unknown, path: string): PersonaGenerationSettings {
    const record = decodeObject(value, path);
    return {
        provider: optionalString(record.provider, `${path}.provider`) ?? null,
        model: optionalString(record.model, `${path}.model`) ?? null,
        temperature: optionalNumber(record.temperature, `${path}.temperature`) ?? null,
        max_tokens: optionalNumber(record.max_tokens, `${path}.max_tokens`) ?? null,
    };
}

export function decodePersona(value: unknown, path: string): Persona {
    const record = decodeObject(value, path);
    return {
        name: requireString(record.name, `${path}.name`),
        subtitle: optionalString(record.subtitle, `${path}.subtitle`) ?? null,
        color: requireString(record.color, `${path}.color`),
        avatar_url: optionalString(record.avatar_url, `${path}.avatar_url`) ?? null,
        provider_config:
            record.provider_config === undefined || record.provider_config === null
                ? { provider: null, model: null, temperature: null, max_tokens: null }
                : decodeGenerationSettings(record.provider_config, `${path}.provider_config`),
        is_default: requireBoolean(record.is_default, `${path}.is_default`),
        stack_ids:
            record.stack_ids === undefined
                ? undefined
                : requireArray(record.stack_ids, `${path}.stack_ids`, (item, childPath) =>
                      requireString(item, childPath)
                  ),
        id: requireString(record.id, `${path}.id`),
        user_id: optionalString(record.user_id, `${path}.user_id`) ?? null,
        created_at: requireString(record.created_at, `${path}.created_at`),
        updated_at: requireString(record.updated_at, `${path}.updated_at`),
        active_prompt: optionalString(record.active_prompt, `${path}.active_prompt`) ?? null,
        active_prompt_version: optionalNumber(record.active_prompt_version, `${path}.active_prompt_version`) ?? null,
    };
}

export function decodePromptRevision(value: unknown, path: string): PromptRevision {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        persona_id: requireString(record.persona_id, `${path}.persona_id`),
        version: requireNumber(record.version, `${path}.version`),
        content: requireString(record.content, `${path}.content`),
        is_active: requireBoolean(record.is_active, `${path}.is_active`),
        created_at: requireString(record.created_at, `${path}.created_at`),
    };
}

export function requirePersonaListResponse(value: unknown, path: string): PersonaListResponse {
    const record = decodeObject(value, path);
    return {
        personas: requireArray(record.personas, `${path}.personas`, (item, childPath) =>
            decodePersona(item, childPath)
        ),
        total: requireNumber(record.total, `${path}.total`),
    };
}
