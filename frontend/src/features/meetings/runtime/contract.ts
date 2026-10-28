/**
 * Meetings runtime contract (spec-14).
 *
 * The room composes against typed feature reads, observation, supported
 * intents, capabilities, and presentation provenance. It never imports a
 * concrete client or the live settings/vault graph. Live and recorded replay
 * supply different implementations of this contract while sharing the same
 * screens and domain decoders.
 */
import type { ComponentType } from "react";
import type { QueryKey } from "@tanstack/react-query";
import type { RuntimeScope } from "@/shared/runtime/scope";
import type {
    AIParticipant,
    Consensus,
    ContextStats,
    Disagreement,
    Meeting,
    MeetingWithParticipants,
    Message,
} from "../api/decoders";
import type { RequestClosingInput } from "../api/closing-client";
import type { ClosingReceipt, ClosingView } from "../api/closing-decoders";
import type { TurnGenerationSettings } from "../api/turn-client";
import type { TurnCancelResult, TurnOperation } from "../api/turn-decoders";
import type { TurnEvent } from "../api/turn-events";
import type { TurnStatus } from "../api/turn-decoders";
import type { ClosingTextEvent } from "../api/closing-stream";

/**
 * Wire shape of a recorded document read. The knowledge feature owns the live
 * decoder; playback only renders recorded metadata, so it declares the fields
 * it actually consumes instead of importing the live API graph.
 */
export interface RecordedDocumentRecord {
    id: string;
    file_name: string;
    file_type: string;
    file_size_bytes: number;
    chunk_count: number;
    status: string;
    meeting_id?: string | null;
    revision_id?: string | null;
    [key: string]: unknown;
}

export interface ReplayIntent {
    intent_id: string;
    kind: string;
    checkpoint: string;
    participant_id?: string | null;
    operation_id?: string | null;
    tape_id?: string | null;
    closing_tape_id?: string | null;
    label?: string;
}

export interface ReplayTape {
    tape_id: string;
    operation_id: string;
    participant_id: string;
    initial_checkpoint: string;
    completed_checkpoint: string;
}

export interface ReplayAsset {
    asset_id: string;
    storage_path: string;
    media_type: string;
    sha256: string;
    size: number;
    locator: string;
    public_url: string;
    source: string;
    capture_date: string | null;
    rights: string;
    authored: boolean;
    public_demo: boolean;
    extraction: string | null;
}

export interface ReplayRuntimeInfo {
    packageId: string;
    packageVersion: string;
    initialCheckpoint: string;
    checkpoint: string;
    checkpoints: string[];
    intents: ReplayIntent[];
    tapes: ReplayTape[];
    assets: ReplayAsset[];
    retired: boolean;
    startIntent(intentId: string): Promise<void>;
    switchCheckpoint(checkpointId: string): Promise<void>;
}

export interface SettlementContext {
    meetingId: string;
    operationId: string;
    event: TurnEvent | null;
    status: TurnStatus;
}

export interface SettlementHook {
    beforeTerminal(context: SettlementContext): Promise<void>;
}

export interface ClosingStreamApi {
    observe(
        meetingId: string,
        closingId: string,
        options: { after?: number; signal?: AbortSignal }
    ): AsyncGenerator<ClosingTextEvent, void, unknown>;
}

export interface MeetingsCapabilities {
    meetingRead: boolean;
    turnObservation: boolean;
    disagreements: boolean;
    consensus: boolean;
    contextStats: boolean;
    createMeeting: boolean;
    sendMessage: boolean;
    submitTurn: boolean;
    cancelTurn: boolean;
    summary: boolean;
    documents: boolean;
    closing: boolean;
}

export interface MeetingsReadsApi {
    listMeetings(signal?: AbortSignal): Promise<Meeting[]>;
    getMeeting(meetingId: string, signal?: AbortSignal): Promise<MeetingWithParticipants>;
    disagreements(meetingId: string, signal?: AbortSignal): Promise<Disagreement[]>;
    consensus(meetingId: string, signal?: AbortSignal): Promise<Consensus[]>;
    contextStats(meetingId: string, signal?: AbortSignal): Promise<ContextStats>;
    closing(meetingId: string, signal?: AbortSignal): Promise<ClosingView>;
    documents?(meetingId: string, signal?: AbortSignal): Promise<RecordedDocumentRecord[]>;
}

export interface MeetingsTurnsApi {
    list(meetingId: string, signal?: AbortSignal): Promise<TurnOperation[]>;
    get(
        meetingId: string,
        operationId: string,
        signal?: AbortSignal
    ): Promise<TurnOperation>;
    observe(
        meetingId: string,
        operationId: string,
        options: { after?: number; signal?: AbortSignal }
    ): AsyncGenerator<TurnEvent, void, unknown>;
    submit(
        meetingId: string,
        input: {
            participantId: string;
            requestKey: string;
            settings?: TurnGenerationSettings;
            signal?: AbortSignal;
        }
    ): Promise<TurnOperation>;
    cancel(
        meetingId: string,
        operationId: string,
        signal?: AbortSignal
    ): Promise<TurnCancelResult>;
}

export interface MeetingsCommandsApi {
    sendMessage(
        meetingId: string,
        content: string,
        signal?: AbortSignal
    ): Promise<Message>;
    requestClosing(
        meetingId: string,
        input: RequestClosingInput
    ): Promise<ClosingReceipt>;
    retryClosing(meetingId: string, signal?: AbortSignal): Promise<ClosingView>;
    abortClosing(meetingId: string, signal?: AbortSignal): Promise<ClosingView>;
}

export interface MeetingsRuntimeKeys {
    meetingList(): QueryKey;
    meetingDetail(meetingId: string): QueryKey;
    disagreements(meetingId: string): QueryKey;
    consensus(meetingId: string): QueryKey;
    contextStats(meetingId: string): QueryKey;
    closing(meetingId: string): QueryKey;
    documents(meetingId: string): QueryKey;
    turnList(meetingId: string): QueryKey;
    turnDetail(meetingId: string, operationId: string): QueryKey;
}

export interface ParticipantActionProps {
    participant: AIParticipant;
    isActive: boolean;
    isQueued: boolean;
    disabled: boolean;
    onStart: (settings?: TurnGenerationSettings) => void;
}

export interface MeetingsRuntimeSlots {
    documentPanel?: ComponentType<{ meetingId: string }>;
    summaryPanel?: ComponentType<{ meeting: MeetingWithParticipants }>;
    participantAction?: ComponentType<ParticipantActionProps>;
}

export interface MeetingsPresentation {
    label: string;
    homeHref: string;
    readOnlyNotice: string;
    provenance: Record<string, unknown>;
}

export interface MeetingsRuntime {
    scope: RuntimeScope;
    capabilities: MeetingsCapabilities;
    reads: MeetingsReadsApi;
    turns: MeetingsTurnsApi;
    commands: MeetingsCommandsApi;
    keys: MeetingsRuntimeKeys;
    presentation: MeetingsPresentation;
    slots: MeetingsRuntimeSlots;
    /** Scoped abort; replay restarts abort every request from the old epoch. */
    signal?: AbortSignal;
    /** Present only for a replay epoch that can be restarted in place. */
    restart?: () => void;
    /** Present only for recorded playback. */
    replay?: ReplayRuntimeInfo;
    /** Called before the shared terminal reconciliation writes caches. */
    settlement?: SettlementHook;
    /** Present only when closing text streams from a recorded source. */
    closingStream?: ClosingStreamApi;
}

export const ALL_MEETING_CAPABILITIES: MeetingsCapabilities = {
    meetingRead: true,
    turnObservation: true,
    disagreements: true,
    consensus: true,
    contextStats: true,
    createMeeting: true,
    sendMessage: true,
    submitTurn: true,
    cancelTurn: true,
    summary: true,
    documents: true,
    closing: true,
};

export const RECORDED_MEETING_CAPABILITIES: MeetingsCapabilities = {
    meetingRead: true,
    turnObservation: true,
    disagreements: true,
    consensus: true,
    contextStats: false,
    createMeeting: false,
    sendMessage: false,
    submitTurn: false,
    cancelTurn: false,
    summary: false,
    documents: false,
    closing: false,
};
