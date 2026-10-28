/**
 * Wire decoders for meeting records (spec-05).
 *
 * Shapes mirror the frozen backend contract snapshot
 * (frontend/tests/fixtures/openapi.json -> components.schemas.*) — the
 * generated types stay the source of truth and these decoders give the
 * runtime breadcrumb-checked validation the generated types cannot.
 */
import { DecodeError, decodeObject, optionalNumber, optionalString, requireArray, requireNumber, requireString } from '@/shared/api/decode';
import type { components } from '@/shared/api/generated';

export type Meeting = components['schemas']['Meeting'];
export type MeetingWithParticipants = components['schemas']['MeetingWithParticipants'];
export type AIParticipant = components['schemas']['AIParticipant'];
export type Message = components['schemas']['Message'];
export type Disagreement = components['schemas']['Disagreement'];
export type Consensus = components['schemas']['Consensus'];

/**
 * The context-stats endpoint has an inline response schema, so this view is
 * hand-written from the frozen contract rather than generated.
 */
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

const MEETING_STATUSES = ['active', 'voting', 'ended', 'archived'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

function requireMeetingStatus(value: unknown, path: string): MeetingStatus {
    const raw = requireString(value, path);
    if (!(MEETING_STATUSES as readonly string[]).includes(raw)) {
        throw new DecodeError(`${path}: expected one of ${MEETING_STATUSES.join(', ')}`);
    }
    return raw as MeetingStatus;
}

const SENDER_TYPES = ['user', 'ai', 'system'] as const;

function requireSenderType(value: unknown, path: string): Message['sender_type'] {
    const raw = requireString(value, path);
    if (!(SENDER_TYPES as readonly string[]).includes(raw)) {
        throw new DecodeError(`${path}: expected one of ${SENDER_TYPES.join(', ')}`);
    }
    return raw as Message['sender_type'];
}

export function decodeMeeting(value: unknown, path: string): Meeting {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        user_id: optionalString(record.user_id, `${path}.user_id`) ?? null,
        name: requireString(record.name, `${path}.name`),
        agenda: optionalString(record.agenda, `${path}.agenda`) ?? '',
        status: requireMeetingStatus(record.status, `${path}.status`),
        total_cost: optionalNumber(record.total_cost, `${path}.total_cost`) ?? 0,
        created_at: requireString(record.created_at, `${path}.created_at`),
    };
}

export function decodeCitation(
    value: unknown,
    path: string
): NonNullable<components['schemas']['Citation']> {
    const record = decodeObject(value, path);
    return {
        source: requireString(record.source, `${path}.source`),
        title: optionalString(record.title, `${path}.title`),
        url: optionalString(record.url, `${path}.url`),
        snippet: optionalString(record.snippet, `${path}.snippet`),
        claim_id: optionalString(record.claim_id, `${path}.claim_id`),
        locator: optionalString(record.locator, `${path}.locator`),
    };
}

export function decodeMessage(value: unknown, path: string): Message {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        meeting_id: requireString(record.meeting_id, `${path}.meeting_id`),
        sender_type: requireSenderType(record.sender_type, `${path}.sender_type`),
        sender_id: optionalString(record.sender_id, `${path}.sender_id`) ?? null,
        sender_name: requireString(record.sender_name, `${path}.sender_name`),
        content: requireString(record.content, `${path}.content`),
        citations: requireArray(record.citations, `${path}.citations`, (item, childPath) =>
            decodeCitation(item, childPath)
        ),
        tool_artifacts:
            record.tool_artifacts === null || record.tool_artifacts === undefined
                ? null
                : (decodeObject(record.tool_artifacts, `${path}.tool_artifacts`) as Record<
                      string,
                      unknown
                  >),
        thinking_content: optionalString(record.thinking_content, `${path}.thinking_content`) ?? null,
        estimated_cost: requireNumber(record.estimated_cost, `${path}.estimated_cost`),
        created_at: requireString(record.created_at, `${path}.created_at`),
    };
}

export function decodeParticipant(value: unknown, path: string): AIParticipant {
    const record = decodeObject(value, path);
    const providerConfig =
        record.provider_config === undefined
            ? undefined
            : decodeObject(record.provider_config, `${path}.provider_config`);
    return {
        id: requireString(record.id, `${path}.id`),
        meeting_id: requireString(record.meeting_id, `${path}.meeting_id`),
        name: requireString(record.name, `${path}.name`),
        role: requireString(record.role, `${path}.role`),
        system_prompt: requireString(record.system_prompt, `${path}.system_prompt`),
        provider_config: {
            provider: optionalString(providerConfig?.provider, `${path}.provider_config.provider`) ?? '',
            model: optionalString(providerConfig?.model, `${path}.provider_config.model`) ?? '',
            temperature: optionalNumber(providerConfig?.temperature, `${path}.provider_config.temperature`) ?? 0.7,
            max_tokens: optionalNumber(providerConfig?.max_tokens, `${path}.provider_config.max_tokens`) ?? 2048,
        },
        color: requireString(record.color, `${path}.color`),
        persona_id: optionalString(record.persona_id, `${path}.persona_id`) ?? null,
        stack_ids:
            record.stack_ids === null
                ? null
                : requireArray(record.stack_ids, `${path}.stack_ids`, (item, childPath) =>
                      requireString(item, childPath)
                  ),
        created_at: requireString(record.created_at, `${path}.created_at`),
    };
}

const DISAGREEMENT_STATUSES = ['open', 'resolved', 'conceded'] as const;

export function decodeDisagreement(value: unknown, path: string): Disagreement {
    const record = decodeObject(value, path);
    const rawStatus = requireString(record.status, `${path}.status`);
    if (!(DISAGREEMENT_STATUSES as readonly string[]).includes(rawStatus)) {
        throw new DecodeError(
            `${path}.status: expected one of ${DISAGREEMENT_STATUSES.join(', ')}`
        );
    }
    return {
        id: requireString(record.id, `${path}.id`),
        meeting_id: requireString(record.meeting_id, `${path}.meeting_id`),
        source_ai_id: requireString(record.source_ai_id, `${path}.source_ai_id`),
        target_name: requireString(record.target_name, `${path}.target_name`),
        topic: requireString(record.topic, `${path}.topic`),
        reasoning: requireString(record.reasoning, `${path}.reasoning`),
        severity: requireNumber(record.severity, `${path}.severity`),
        status: rawStatus as Disagreement['status'],
        created_at: requireString(record.created_at, `${path}.created_at`),
    };
}

export function decodeConsensus(value: unknown, path: string): Consensus {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        meeting_id: requireString(record.meeting_id, `${path}.meeting_id`),
        participants: requireArray(record.participants, `${path}.participants`, (item, childPath) =>
            requireString(item, childPath)
        ),
        topic: requireString(record.topic, `${path}.topic`),
        strength: requireNumber(record.strength, `${path}.strength`),
        created_at: requireString(record.created_at, `${path}.created_at`),
    };
}

export function decodeContextStats(value: unknown, path: string): ContextStats {
    const record = decodeObject(value, path);
    return {
        current_tokens: requireNumber(record.current_tokens, `${path}.current_tokens`),
        max_tokens: requireNumber(record.max_tokens, `${path}.max_tokens`),
        usage_percent: requireNumber(record.usage_percent, `${path}.usage_percent`),
        message_tokens: optionalNumber(record.message_tokens, `${path}.message_tokens`),
        system_tokens: optionalNumber(record.system_tokens, `${path}.system_tokens`),
        agenda_tokens: optionalNumber(record.agenda_tokens, `${path}.agenda_tokens`),
        message_count: requireNumber(record.message_count, `${path}.message_count`),
        participant_count: requireNumber(record.participant_count, `${path}.participant_count`),
    };
}

export function decodeMeetingWithParticipants(value: unknown, path: string): MeetingWithParticipants {
    const meeting = decodeMeeting(value, path);
    const record = decodeObject(value, path);
    return {
        ...meeting,
        participants: requireArray(record.participants, `${path}.participants`, (item, childPath) =>
            decodeParticipant(item, childPath)
        ),
        messages: requireArray(record.messages, `${path}.messages`, (item, childPath) =>
            decodeMessage(item, childPath)
        ),
    };
}
