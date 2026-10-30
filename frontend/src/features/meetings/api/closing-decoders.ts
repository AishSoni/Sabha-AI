/**
 * Wire decoders for coordinated meeting closing (spec-08).
 *
 * Stages are deliberately narrower than meeting lifecycle: a closing
 * operation can fail or be rejected while the meeting stays active. The
 * decoder rejects unknown stages instead of letting an unrecognized value
 * fall through to the UI as "in progress".
 */
import {
    DecodeError,
    decodeObject,
    optionalBoolean,
    optionalNumber,
    optionalString,
    requireArray,
    requireBoolean,
    requireString,
} from '@/shared/api/decode';
import type { components } from '@/shared/api/generated';

export type ClosingVote = components['schemas']['ClosingVoteView'];
export type ClosingMode = 'vote' | 'force';

/** Browser-composed summary settings for a close request. */
export interface ClosingSummarySettings {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    baseUrl?: string;
}

/** Stable close intent; a retry must reuse the same request key. */
export interface RequestClosingInput {
    mode: ClosingMode;
    requestKey: string;
    summarySettings?: ClosingSummarySettings;
    signal?: AbortSignal;
}

/**
 * The generated schema types stay the contract source; this decoders-owned
 * view tightens the fields the runtime decoder always proves.
 */
export type ClosingView = Omit<
    components['schemas']['ClosingView'],
    'mode' | 'stage' | 'failed_from_stage' | 'votes'
> & {
    mode: ClosingMode | null;
    stage: ClosingStage | null;
    failed_from_stage: ClosingStage | null;
    votes: ClosingVote[];
};

export type ClosingReceipt = Omit<components['schemas']['ClosingReceipt'], 'stage'> & {
    stage: ClosingStage;
};

const MEETING_STATUSES = ['active', 'voting', 'ended', 'archived'] as const;
const CLOSING_STAGES = [
    'draining',
    'voting',
    'summarizing',
    'failed',
    'rejected',
    'aborted',
    'completed',
] as const;
const CLOSING_MODES = ['vote', 'force'] as const;

export type ClosingStage = (typeof CLOSING_STAGES)[number];

/** Stages whose outcome can no longer change without an explicit retry. */
const SETTLED_STAGES = ['completed', 'rejected', 'aborted', 'failed'] as const;

/** Stages that are still advancing and therefore worth polling. */
const POLLING_STAGES = ['draining', 'voting', 'summarizing'] as const;

export function isClosingStage(value: string): value is ClosingStage {
    return (CLOSING_STAGES as readonly string[]).includes(value);
}

export function isSettledClosingStage(stage: string | null | undefined): boolean {
    return Boolean(stage && (SETTLED_STAGES as readonly string[]).includes(stage));
}

export function isPollingClosingStage(stage: string | null | undefined): boolean {
    return Boolean(stage && (POLLING_STAGES as readonly string[]).includes(stage));
}

function optionalStage(value: unknown, path: string): ClosingStage | null {
    const raw = optionalString(value, path);
    if (raw === undefined) return null;
    if (!isClosingStage(raw)) {
        throw new DecodeError(`${path}: expected one of ${CLOSING_STAGES.join(', ')}`);
    }
    return raw;
}

function requireMeetingStatus(value: unknown, path: string): ClosingView['meeting_status'] {
    const raw = requireString(value, path);
    if (!(MEETING_STATUSES as readonly string[]).includes(raw)) {
        throw new DecodeError(`${path}: expected one of ${MEETING_STATUSES.join(', ')}`);
    }
    return raw as ClosingView['meeting_status'];
}

function optionalMode(value: unknown, path: string): ClosingMode | null {
    const raw = optionalString(value, path);
    if (raw === undefined) return null;
    if (!(CLOSING_MODES as readonly string[]).includes(raw)) {
        throw new DecodeError(`${path}: expected one of ${CLOSING_MODES.join(', ')}`);
    }
    return raw as ClosingMode;
}

function decodeVote(value: unknown, path: string): ClosingVote {
    const record = decodeObject(value, path);
    return {
        participant_id: requireString(record.participant_id, `${path}.participant_id`),
        participant_name: requireString(record.participant_name, `${path}.participant_name`),
        role: optionalString(record.role, `${path}.role`) ?? null,
        status: requireString(record.status, `${path}.status`),
        vote: optionalBoolean(record.vote, `${path}.vote`) ?? null,
        reason: optionalString(record.reason, `${path}.reason`) ?? null,
        provider: optionalString(record.provider, `${path}.provider`) ?? null,
        model: optionalString(record.model, `${path}.model`) ?? null,
        usage_kind: optionalString(record.usage_kind, `${path}.usage_kind`) ?? null,
        price_kind: optionalString(record.price_kind, `${path}.price_kind`) ?? null,
        estimated_cost: optionalNumber(record.estimated_cost, `${path}.estimated_cost`) ?? null,
        reported_cost: optionalNumber(record.reported_cost, `${path}.reported_cost`) ?? null,
        error_code: optionalString(record.error_code, `${path}.error_code`) ?? null,
        error_message: optionalString(record.error_message, `${path}.error_message`) ?? null,
        completed_at: optionalString(record.completed_at, `${path}.completed_at`) ?? null,
    };
}

export function decodeClosingView(value: unknown, path: string): ClosingView {
    const record = decodeObject(value, path);
    const error =
        record.error === null || record.error === undefined
            ? null
            : decodeObject(record.error, `${path}.error`);

    return {
        meeting_id: requireString(record.meeting_id, `${path}.meeting_id`),
        meeting_status: requireMeetingStatus(record.meeting_status, `${path}.meeting_status`),
        archived: requireBoolean(record.archived, `${path}.archived`),
        closing_id: optionalString(record.closing_id, `${path}.closing_id`) ?? null,
        request_key: optionalString(record.request_key, `${path}.request_key`) ?? null,
        mode: optionalMode(record.mode, `${path}.mode`),
        stage: optionalStage(record.stage, `${path}.stage`),
        failed_from_stage: optionalStage(record.failed_from_stage, `${path}.failed_from_stage`),
        votes:
            record.votes === null || record.votes === undefined
                ? []
                : requireArray(record.votes, `${path}.votes`, (item, childPath) =>
                      decodeVote(item, childPath)
                  ),
        summary: optionalString(record.summary, `${path}.summary`) ?? null,
        summary_message_id:
            optionalString(record.summary_message_id, `${path}.summary_message_id`) ?? null,
        error: error
            ? {
                  code: requireString(error.code, `${path}.error.code`),
                  message: requireString(error.message, `${path}.error.message`),
              }
            : null,
        retryable: requireBoolean(record.retryable, `${path}.retryable`),
        abortable: requireBoolean(record.abortable, `${path}.abortable`),
        created_at: optionalString(record.created_at, `${path}.created_at`) ?? null,
        updated_at: optionalString(record.updated_at, `${path}.updated_at`) ?? null,
        completed_at: optionalString(record.completed_at, `${path}.completed_at`) ?? null,
    };
}

export function decodeClosingReceipt(value: unknown, path: string): ClosingReceipt {
    const record = decodeObject(value, path);
    const stage = optionalStage(record.stage, `${path}.stage`);
    if (!stage) {
        throw new DecodeError(`${path}.stage: expected a closing stage`);
    }
    return {
        meeting_id: requireString(record.meeting_id, `${path}.meeting_id`),
        closing_id: requireString(record.closing_id, `${path}.closing_id`),
        stage,
        meeting_status: requireMeetingStatus(record.meeting_status, `${path}.meeting_status`),
    };
}
