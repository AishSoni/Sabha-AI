/**
 * Wire decoders for persona records (spec-05).
 *
 * Shapes mirror the frozen backend contract snapshot
 * (frontend/tests/fixtures/openapi.json -> components.schemas.*) — the
 * generated types stay the source of truth and these decoders give the
 * runtime breadcrumb-checked validation the generated types cannot.
 */
import { DecodeError, decodeObject, optionalNumber, optionalString, requireArray, requireBoolean, requireNumber, requireString } from '@/shared/api/decode';
import type { components } from '@/shared/api/generated';

export type Persona = components['schemas']['PersonaWithPrompt'];
export type PersonaListResponse = components['schemas']['PersonaListResponse'];

function decodeProviderConfig(
    value: unknown,
    path: string
): NonNullable<components['schemas']['app__models__persona_schemas__ProviderConfig']> {
    const record = decodeObject(value, path);
    return {
        provider: optionalString(record.provider, `${path}.provider`) ?? '',
        model: optionalString(record.model, `${path}.model`) ?? '',
        temperature: optionalNumber(record.temperature, `${path}.temperature`) ?? 0.7,
        max_tokens: optionalNumber(record.max_tokens, `${path}.max_tokens`) ?? 2048,
    };
}

export function decodePersona(value: unknown, path: string): Persona {
    const record = decodeObject(value, path);
    const providerConfig =
        record.provider_config === undefined || record.provider_config === null
            ? undefined
            : decodeProviderConfig(record.provider_config, `${path}.provider_config`);
    return {
        name: requireString(record.name, `${path}.name`),
        subtitle: optionalString(record.subtitle, `${path}.subtitle`) ?? null,
        color: requireString(record.color, `${path}.color`),
        avatar_url: optionalString(record.avatar_url, `${path}.avatar_url`) ?? null,
        provider_config: providerConfig,
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

function requirePersonaListResponse(value: unknown, path: string): PersonaListResponse {
    const record = decodeObject(value, path);
    return {
        personas: requireArray(record.personas, `${path}.personas`, (item, childPath) =>
            decodePersona(item, childPath)
        ),
        total: requireNumber(record.total, `${path}.total`),
    };
}

/** Kept internal for now; the list query is the only consumer. */
export { requirePersonaListResponse };
