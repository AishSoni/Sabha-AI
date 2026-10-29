"use client";

/**
 * Recorded replay runtime (spec-14/17).
 *
 * Every read targets the composed `/api/replay` graph at one allowlisted
 * checkpoint. There is no live fallback, no live settings import, and no
 * credential handoff. The activity epoch changes on every checkpoint or
 * restart; old JSON/SSE responses are discarded and their controllers aborted.
 * A terminal settlement installs the canonical completed checkpoint before the
 * shared invalidation runs.
 */
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
    decodeObject,
    optionalString,
    requireArray,
    requireBoolean,
    requireNumber,
    requireString,
} from "@/shared/api/decode";
import { isApiError } from "@/shared/api/errors";
import { requestJson, resolveApiBaseUrl } from "@/shared/api/transport";
import { makeQueryClient } from "@/shared/query/client";
import { ApiError } from "@/shared/api/errors";
import {
    combineSignals,
    RuntimeScopeProvider,
    type RuntimeScope,
} from "@/shared/runtime/scope";
import {
    decodeConsensus,
    decodeContextStats,
    decodeDisagreement,
    decodeMeetingWithParticipants,
} from "../api/decoders";
import { decodeClosingView } from "../api/closing-decoders";
import {
    decodeClosingTextStream,
} from "../api/closing-stream";
import {
    decodeTurnOperation,
    type TurnOperation,
} from "../api/turn-decoders";
import { decodeTurnEventStream, type TurnEvent } from "../api/turn-events";
import { MeetingRoom } from "../components/MeetingRoom";
import type {
    MeetingsCapabilities,
    MeetingsRuntime,
    RecordedDocumentRecord,
    ReplayAsset,
    ReplayBeat,
    ReplayBeatStep,
    ReplayClaim,
    ReplayIntent,
    ReplayPreview,
    ReplayTape,
} from "./contract";
import { MeetingsRuntimeProvider } from "./context";
import { RecordedParticipantAction } from "./recorded-participant-action";
import { RecordedDirectorAction } from "./recorded-director-action";
import { RecordedDocumentsPanel } from "./recorded-documents-panel";

export interface ReplaySession {
    run_id: string;
    package_version: string;
    meeting_id: string;
    label: string;
    title: string;
    as_of: string;
    disclosure: string;
    stack_labels: Record<string, string>;
    provenance: Record<string, unknown>;
    capabilities: MeetingsCapabilities;
    package_id: string;
    content_sha256: string;
    checkpoint_id: string;
    initial_checkpoint: string;
    checkpoints: string[];
    intents: ReplayIntent[];
    beats: ReplayBeat[];
    tapes: ReplayTape[];
    assets: ReplayAsset[];
    claims: ReplayClaim[];
    preview: ReplayPreview;
    retired: boolean;
}

const BEAT_COMPLETIONS = [
    "acknowledge",
    "turn_terminal",
    "closing_completed",
    "checkpoint",
] as const;

const BEAT_ROUTES = ["board", "new", "meeting", "list"] as const;

function requireChoice<T extends string>(
    value: unknown,
    path: string,
    choices: readonly T[]
): T {
    const text = requireString(value, path);
    if (!choices.includes(text as T)) {
        throw new Error(`${path} is not a supported choice`);
    }
    return text as T;
}

function optionalChoice<T extends string>(
    value: unknown,
    path: string,
    choices: readonly T[]
): T | null {
    if (value === null || value === undefined) return null;
    return requireChoice(value, path, choices);
}

function decodeStringMap(value: unknown, path: string): Record<string, string> {
    const record = decodeObject(value, path);
    return Object.fromEntries(
        Object.entries(record).map(([key, item]) => [
            key,
            requireString(item, `${path}.${key}`),
        ])
    );
}

function decodeBeatStep(value: unknown, path: string): ReplayBeatStep {
    const record = decodeObject(value, path);
    return {
        step_id: requireString(record.step_id, `${path}.step_id`),
        label: requireString(record.label, `${path}.label`),
        intent_id: optionalString(record.intent_id, `${path}.intent_id`) ?? null,
        completion: requireChoice(
            record.completion,
            `${path}.completion`,
            BEAT_COMPLETIONS
        ),
        requires_tab:
            optionalString(record.requires_tab, `${path}.requires_tab`) ?? null,
    };
}

function decodeBeat(value: unknown, path: string): ReplayBeat {
    const record = decodeObject(value, path);
    return {
        beat_id: requireString(record.beat_id, `${path}.beat_id`),
        title: requireString(record.title, `${path}.title`),
        anchor: requireString(record.anchor, `${path}.anchor`),
        checkpoint: requireString(record.checkpoint, `${path}.checkpoint`),
        intent_id: optionalString(record.intent_id, `${path}.intent_id`) ?? null,
        ordinal:
            record.ordinal === null || record.ordinal === undefined
                ? null
                : requireNumber(record.ordinal, `${path}.ordinal`),
        objective:
            optionalString(record.objective, `${path}.objective`) ?? null,
        route: optionalChoice(record.route, `${path}.route`, BEAT_ROUTES),
        tab: optionalString(record.tab, `${path}.tab`) ?? null,
        start_checkpoint:
            optionalString(record.start_checkpoint, `${path}.start_checkpoint`) ??
            null,
        completed_checkpoint:
            optionalString(
                record.completed_checkpoint,
                `${path}.completed_checkpoint`
            ) ?? null,
        disclosure:
            optionalString(record.disclosure, `${path}.disclosure`) ?? null,
        steps: requireArray(
            record.steps ?? [],
            `${path}.steps`,
            decodeBeatStep
        ),
        claim_ids: requireArray(
            record.claim_ids ?? [],
            `${path}.claim_ids`,
            (item, itemPath) => requireString(item, itemPath)
        ),
        input_asset_ids: requireArray(
            record.input_asset_ids ?? [],
            `${path}.input_asset_ids`,
            (item, itemPath) => requireString(item, itemPath)
        ),
    };
}

function decodeCapabilities(value: unknown, path: string): MeetingsCapabilities {
    const record = decodeObject(value, path);
    return {
        meetingRead: requireBoolean(record.meetingRead, `${path}.meetingRead`),
        turnObservation: requireBoolean(
            record.turnObservation,
            `${path}.turnObservation`
        ),
        disagreements: requireBoolean(record.disagreements, `${path}.disagreements`),
        consensus: requireBoolean(record.consensus, `${path}.consensus`),
        contextStats: requireBoolean(record.contextStats, `${path}.contextStats`),
        createMeeting: requireBoolean(record.createMeeting, `${path}.createMeeting`),
        sendMessage: requireBoolean(record.sendMessage, `${path}.sendMessage`),
        submitTurn: requireBoolean(record.submitTurn, `${path}.submitTurn`),
        cancelTurn: requireBoolean(record.cancelTurn, `${path}.cancelTurn`),
        summary: requireBoolean(record.summary, `${path}.summary`),
        documents: requireBoolean(record.documents, `${path}.documents`),
        closing: requireBoolean(record.closing, `${path}.closing`),
    };
}

function decodeIntent(value: unknown, path: string): ReplayIntent {
    const record = decodeObject(value, path);
    return {
        intent_id: requireString(record.intent_id, `${path}.intent_id`),
        kind: requireString(record.kind, `${path}.kind`),
        checkpoint: requireString(record.checkpoint, `${path}.checkpoint`),
        participant_id: optionalString(record.participant_id, `${path}.participant_id`) ?? null,
        operation_id: optionalString(record.operation_id, `${path}.operation_id`) ?? null,
        tape_id: optionalString(record.tape_id, `${path}.tape_id`) ?? null,
        closing_tape_id:
            optionalString(record.closing_tape_id, `${path}.closing_tape_id`) ?? null,
        label: optionalString(record.label, `${path}.label`) ?? "",
    };
}

function decodeTape(value: unknown, path: string): ReplayTape {
    const record = decodeObject(value, path);
    return {
        tape_id: requireString(record.tape_id, `${path}.tape_id`),
        operation_id: requireString(record.operation_id, `${path}.operation_id`),
        participant_id: requireString(record.participant_id, `${path}.participant_id`),
        initial_checkpoint: requireString(
            record.initial_checkpoint,
            `${path}.initial_checkpoint`
        ),
        completed_checkpoint: requireString(
            record.completed_checkpoint,
            `${path}.completed_checkpoint`
        ),
    };
}

function decodeClaim(value: unknown, path: string): ReplayClaim {
    const record = decodeObject(value, path);
    return {
        claim_id: requireString(record.claim_id, `${path}.claim_id`),
        kind: requireString(record.kind, `${path}.kind`),
        text: requireString(record.text, `${path}.text`),
        evidence_asset_id:
            optionalString(record.evidence_asset_id, `${path}.evidence_asset_id`) ?? null,
        locator: optionalString(record.locator, `${path}.locator`) ?? null,
        excerpt: optionalString(record.excerpt, `${path}.excerpt`) ?? null,
        source_url: optionalString(record.source_url, `${path}.source_url`) ?? null,
        source_title: optionalString(record.source_title, `${path}.source_title`) ?? null,
        capture_date: optionalString(record.capture_date, `${path}.capture_date`) ?? null,
    };
}

function decodePreview(value: unknown, path: string): ReplayPreview {
    const record = decodeObject(value, path);
    return {
        available: requireBoolean(record.available, `${path}.available`),
        asset_ids: requireArray(record.asset_ids ?? [], `${path}.asset_ids`, (item, itemPath) =>
            requireString(item, itemPath)
        ),
    };
}

function decodeAsset(value: unknown, path: string): ReplayAsset {
    const record = decodeObject(value, path);
    return {
        asset_id: requireString(record.asset_id, `${path}.asset_id`),
        storage_path: requireString(record.storage_path, `${path}.storage_path`),
        media_type: requireString(record.media_type, `${path}.media_type`),
        sha256: requireString(record.sha256, `${path}.sha256`),
        size: requireNumber(record.size, `${path}.size`),
        locator: requireString(record.locator, `${path}.locator`),
        public_url: requireString(record.public_url, `${path}.public_url`),
        source: requireString(record.source, `${path}.source`),
        capture_date: optionalString(record.capture_date, `${path}.capture_date`) ?? null,
        rights: requireString(record.rights, `${path}.rights`),
        authored: requireBoolean(record.authored, `${path}.authored`),
        public_demo: requireBoolean(record.public_demo, `${path}.public_demo`),
        extraction: optionalString(record.extraction, `${path}.extraction`) ?? null,
    };
}

export function decodeReplaySession(value: unknown): ReplaySession {
    const record = decodeObject(value, "GET /replay/session");
    return {
        run_id: requireString(record.run_id, "GET /replay/session.run_id"),
        package_version: requireString(
            record.package_version,
            "GET /replay/session.package_version"
        ),
        meeting_id: requireString(
            record.meeting_id,
            "GET /replay/session.meeting_id"
        ),
        label: optionalString(record.label, "GET /replay/session.label") ?? "Recorded session",
        title: optionalString(record.title, "GET /replay/session.title") ?? "",
        as_of: optionalString(record.as_of, "GET /replay/session.as_of") ?? "",
        disclosure:
            optionalString(record.disclosure, "GET /replay/session.disclosure") ?? "",
        stack_labels: decodeStringMap(
            record.stack_labels ?? {},
            "GET /replay/session.stack_labels"
        ),
        provenance: decodeObject(
            record.provenance ?? {},
            "GET /replay/session.provenance"
        ),
        capabilities: decodeCapabilities(
            record.capabilities,
            "GET /replay/session.capabilities"
        ),
        package_id: requireString(record.package_id ?? "", "GET /replay/session.package_id"),
        content_sha256: requireString(
            record.content_sha256 ?? "",
            "GET /replay/session.content_sha256"
        ),
        checkpoint_id: requireString(
            record.checkpoint_id ?? "",
            "GET /replay/session.checkpoint_id"
        ),
        initial_checkpoint: requireString(
            record.initial_checkpoint ?? "",
            "GET /replay/session.initial_checkpoint"
        ),
        checkpoints: requireArray(
            record.checkpoints ?? [],
            "GET /replay/session.checkpoints",
            (item, path) => requireString(item, path)
        ),
        intents: requireArray(
            record.intents ?? [],
            "GET /replay/session.intents",
            decodeIntent
        ),
        beats: requireArray(
            record.beats ?? [],
            "GET /replay/session.beats",
            decodeBeat
        ),
        tapes: requireArray(
            record.tapes ?? [],
            "GET /replay/session.tapes",
            decodeTape
        ),
        assets: requireArray(
            record.assets ?? [],
            "GET /replay/session.assets",
            decodeAsset
        ),
        claims: requireArray(
            record.claims ?? [],
            "GET /replay/session.claims",
            decodeClaim
        ),
        preview: decodePreview(record.preview, "GET /replay/session.preview"),
        retired: requireBoolean(record.retired ?? false, "GET /replay/session.retired"),
    };
}

export function replayKeyPrefix(
    scopeId: string,
    epoch: number,
    checkpoint: string
): readonly unknown[] {
    return ["replay", scopeId, epoch, checkpoint];
}

function checkpointQuery(path: string, checkpoint: string): string {
    if (!checkpoint) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}checkpoint=${encodeURIComponent(checkpoint)}`;
}

function replayTurnEventsUrl(
    meetingId: string,
    operationId: string,
    checkpoint: string,
    after = 0
): string {
    const base = resolveApiBaseUrl();
    const query = checkpoint
        ? `checkpoint=${encodeURIComponent(checkpoint)}&after=${after}`
        : `after=${after}`;
    return (
        `${base}/replay/meetings/${encodeURIComponent(meetingId)}` +
        `/turns/${encodeURIComponent(operationId)}/events?${query}`
    );
}

function replayClosingEventsUrl(
    meetingId: string,
    checkpoint: string,
    after = 0
): string {
    const base = resolveApiBaseUrl();
    const query = checkpoint
        ? `checkpoint=${encodeURIComponent(checkpoint)}&after=${after}`
        : `after=${after}`;
    return (
        `${base}/replay/meetings/${encodeURIComponent(meetingId)}` +
        `/closing/events?${query}`
    );
}

function replayReadonly(command: string): Promise<never> {
    return Promise.reject(
        new ApiError("http", 403, `Replay is read-only (${command}).`)
    );
}

export interface ReplayBundle {
    meeting: Awaited<ReturnType<typeof decodeMeetingWithParticipants>>;
    disagreements: ReturnType<typeof decodeDisagreement>[];
    consensus: ReturnType<typeof decodeConsensus>[];
    contextStats: ReturnType<typeof decodeContextStats> | null;
    closing: Awaited<ReturnType<typeof decodeClosingView>> | null;
    turns: TurnOperation[];
}

export async function fetchReplayBundle(
    session: ReplaySession,
    meetingId: string,
    checkpoint: string,
    signal: AbortSignal
): Promise<ReplayBundle> {
    const base = `/replay/meetings/${encodeURIComponent(meetingId)}`;
    const read = (path: string) =>
        requestJson<unknown>(checkpointQuery(path, checkpoint), { signal });

    const [meeting, disagreements, consensus, contextStats, closing, turns] =
        await Promise.all([
            read(base).then((payload) =>
                decodeMeetingWithParticipants(payload, "GET /replay/meetings/:id")
            ),
            read(`${base}/disagreements`).then((payload) =>
                requireArray(payload, "GET /replay/.../disagreements", decodeDisagreement)
            ),
            read(`${base}/consensus`).then((payload) =>
                requireArray(payload, "GET /replay/.../consensus", decodeConsensus)
            ),
            session.capabilities.contextStats
                ? read(`${base}/context-stats`).then((payload) =>
                      decodeContextStats(payload, "GET /replay/.../context-stats")
                  )
                : Promise.resolve(null),
            session.capabilities.closing
                ? read(`${base}/closing`).then((payload) =>
                      decodeClosingView(payload, "GET /replay/.../closing")
                  )
                : Promise.resolve(null),
            read(`${base}/turns`).then((payload) =>
                requireArray(payload, "GET /replay/.../turns", decodeTurnOperation)
            ),
        ]);

    return { meeting, disagreements, consensus, contextStats, closing, turns };
}

interface ReplayRuntimeOptions {
    signal: AbortSignal;
    /**
     * Only set when the room itself owns restart (the standalone replay room).
     * The guided composition keeps restart in its controller so the room header
     * does not offer a second, divergent restart path.
     */
    restart?: () => void;
    checkpoint: string;
    queryClient: QueryClient;
    switchCheckpoint: (
        checkpoint: string,
        options?: { expectedMessageId?: string | null; expectedOperationId?: string | null }
    ) => Promise<void>;
    startIntent: (intentId: string) => Promise<void>;
    onTurnSettled?: (intentId: string) => void;
    onClosingTerminal?: () => void;
    isTurnVisible?: (operationId: string) => boolean;
}

export function createReplayRuntime(
    session: ReplaySession,
    scope: RuntimeScope,
    options: ReplayRuntimeOptions
): MeetingsRuntime {
    const { checkpoint, queryClient } = options;
    const prefix = replayKeyPrefix(scope.identity.id, scope.identity.epoch, checkpoint);
    const meetingPath = checkpointQuery(
        `/replay/meetings/${encodeURIComponent(session.meeting_id)}`,
        checkpoint
    );

    return {
        scope,
        capabilities: session.capabilities,
        reads: {
            listMeetings: async (callerSignal) => {
                const payload = await requestJson<unknown>(
                    checkpointQuery("/replay/meetings", checkpoint),
                    { signal: combineSignals(options.signal, callerSignal) }
                );
                return requireArray(payload, "GET /replay/meetings", (value, path) => {
                    const record = decodeObject(value, path);
                    return decodeMeetingWithParticipants(
                        { ...record, participants: [], messages: [] },
                        path
                    );
                });
            },
            getMeeting: async (meetingId, callerSignal) => {
                const payload = await requestJson<unknown>(
                    meetingId === session.meeting_id
                        ? meetingPath
                        : checkpointQuery(
                              `/replay/meetings/${encodeURIComponent(meetingId)}`,
                              checkpoint
                          ),
                    { signal: combineSignals(options.signal, callerSignal) }
                );
                return decodeMeetingWithParticipants(payload, "GET /replay/meetings/:id");
            },
            disagreements: async (meetingId, callerSignal) => {
                const payload = await requestJson<unknown>(
                    checkpointQuery(
                        `/replay/meetings/${encodeURIComponent(meetingId)}/disagreements`,
                        checkpoint
                    ),
                    { signal: combineSignals(options.signal, callerSignal) }
                );
                return requireArray(payload, "GET /replay/.../disagreements", decodeDisagreement);
            },
            consensus: async (meetingId, callerSignal) => {
                const payload = await requestJson<unknown>(
                    checkpointQuery(
                        `/replay/meetings/${encodeURIComponent(meetingId)}/consensus`,
                        checkpoint
                    ),
                    { signal: combineSignals(options.signal, callerSignal) }
                );
                return requireArray(payload, "GET /replay/.../consensus", decodeConsensus);
            },
            contextStats: async (meetingId, callerSignal) => {
                if (!session.capabilities.contextStats) {
                    throw new ApiError(
                        "http",
                        404,
                        "Context statistics are not part of this recording."
                    );
                }
                const payload = await requestJson<unknown>(
                    checkpointQuery(
                        `/replay/meetings/${encodeURIComponent(meetingId)}/context-stats`,
                        checkpoint
                    ),
                    { signal: combineSignals(options.signal, callerSignal) }
                );
                return decodeContextStats(payload, "GET /replay/.../context-stats");
            },
            closing: async (meetingId, callerSignal) => {
                if (!session.capabilities.closing) {
                    throw new ApiError("http", 404, "Closing is not part of this recording.");
                }
                const payload = await requestJson<unknown>(
                    checkpointQuery(
                        `/replay/meetings/${encodeURIComponent(meetingId)}/closing`,
                        checkpoint
                    ),
                    { signal: combineSignals(options.signal, callerSignal) }
                );
                return decodeClosingView(payload, "GET /replay/.../closing");
            },
            documents: async (meetingId, callerSignal) => {
                if (!session.capabilities.documents) return [];
                const payload = await requestJson<unknown>(
                    checkpointQuery(
                        `/replay/meetings/${encodeURIComponent(meetingId)}/documents`,
                        checkpoint
                    ),
                    { signal: combineSignals(options.signal, callerSignal) }
                );
                return requireArray(
                    payload,
                    "GET /replay/.../documents",
                    (value, path) =>
                        decodeObject(value, path) as unknown as RecordedDocumentRecord
                );
            },
        },
        turns: {
            list: async (meetingId, callerSignal) => {
                const payload = await requestJson<unknown>(
                    checkpointQuery(
                        `/replay/meetings/${encodeURIComponent(meetingId)}/turns`,
                        checkpoint
                    ),
                    { signal: combineSignals(options.signal, callerSignal) }
                );
                const operations = requireArray(
                    payload,
                    "GET /replay/.../turns",
                    decodeTurnOperation
                );
                const terminal = new Set([
                    "completed",
                    "failed",
                    "interrupted",
                    "cancelled",
                ]);
                return operations.filter(
                    (operation) =>
                        terminal.has(operation.status) ||
                        options.isTurnVisible?.(operation.operation_id) !== false
                );
            },
            get: async (meetingId, operationId, callerSignal) => {
                const payload = await requestJson<unknown>(
                    checkpointQuery(
                        `/replay/meetings/${encodeURIComponent(meetingId)}` +
                            `/turns/${encodeURIComponent(operationId)}`,
                        checkpoint
                    ),
                    { signal: combineSignals(options.signal, callerSignal) }
                );
                return decodeTurnOperation(payload, "GET /replay/.../turns/:id");
            },
            observe: async function* (
                meetingId: string,
                operationId: string,
                observeOptions
            ): AsyncGenerator<TurnEvent, void, unknown> {
                if (meetingId !== session.meeting_id) {
                    throw new ApiError("http", 404, "Recorded meeting not found.");
                }
                const response = await fetch(
                    replayTurnEventsUrl(
                        meetingId,
                        operationId,
                        checkpoint,
                        observeOptions.after ?? 0
                    ),
                    {
                        headers: { Accept: "text/event-stream" },
                        signal: combineSignals(options.signal, observeOptions.signal),
                    }
                );
                yield* decodeTurnEventStream(response);
            },
            submit: async () => replayReadonly("submit turn"),
            cancel: async () => replayReadonly("cancel turn"),
        },
        commands: {
            sendMessage: async () => replayReadonly("send message"),
            requestClosing: async () => replayReadonly("request closing"),
            retryClosing: async () => replayReadonly("retry closing"),
            abortClosing: async () => replayReadonly("abort closing"),
        },
        keys: {
            meetingList: () => [...prefix, "meetings", "list"],
            meetingDetail: (meetingId) => [...prefix, "meetings", "detail", meetingId],
            disagreements: (meetingId) => [
                ...prefix,
                "meetings",
                "detail",
                meetingId,
                "disagreements",
            ],
            consensus: (meetingId) => [
                ...prefix,
                "meetings",
                "detail",
                meetingId,
                "consensus",
            ],
            contextStats: (meetingId) => [
                ...prefix,
                "meetings",
                "detail",
                meetingId,
                "context-stats",
            ],
            closing: (meetingId) => [
                ...prefix,
                "meetings",
                "detail",
                meetingId,
                "closing",
            ],
            documents: (meetingId) => [
                ...prefix,
                "meetings",
                "detail",
                meetingId,
                "documents",
            ],
            turnList: (meetingId) => [...prefix, "turns", meetingId],
            turnDetail: (meetingId, operationId) => [
                ...prefix,
                "turns",
                meetingId,
                operationId,
            ],
        },
        presentation: {
            label: session.label,
            homeHref: "/demo",
            readOnlyNotice:
                "Recorded session. Playback is read-only; no live action is available.",
            provenance: session.provenance,
        },
        slots: {
            participantAction: RecordedParticipantAction,
            directorAction: RecordedDirectorAction,
            documentPanel: RecordedDocumentsPanel,
        },
        signal: options.signal,
        ...(options.restart ? { restart: options.restart } : {}),
        replay: {
            packageId: session.package_id,
            packageVersion: session.package_version,
            initialCheckpoint: session.initial_checkpoint,
            checkpoint,
            checkpoints: session.checkpoints,
            title: session.title,
            asOf: session.as_of,
            disclosure: session.disclosure,
            stackLabels: session.stack_labels,
            beats: session.beats,
            intents: session.intents,
            tapes: session.tapes,
            assets: session.assets,
            claims: session.claims,
            preview: session.preview,
            retired: session.retired,
            startIntent: options.startIntent,
            switchCheckpoint: async (next) => {
                await options.switchCheckpoint(next);
            },
        },
        settlement: {
            beforeTerminal: async ({ operationId, event }) => {
                const tape = session.tapes.find(
                    (item) => item.operation_id === operationId
                );
                if (!tape) return;
                await options.switchCheckpoint(tape.completed_checkpoint, {
                    expectedMessageId: event?.messageId ?? null,
                    expectedOperationId: operationId,
                });
                const intent = session.intents.find(
                    (item) => item.operation_id === operationId
                );
                if (intent) options.onTurnSettled?.(intent.intent_id);
            },
        },
        closingStream: {
            observe: async function* (
                meetingId: string,
                closingId: string,
                observeOptions
            ) {
                const response = await fetch(
                    replayClosingEventsUrl(
                        meetingId,
                        checkpoint,
                        observeOptions.after ?? 0
                    ),
                    {
                        headers: { Accept: "text/event-stream" },
                        signal: combineSignals(options.signal, observeOptions.signal),
                    }
                );
                let terminalSeen = false;
                for await (const event of decodeClosingTextStream(response)) {
                    if (event.terminal && event.kind === "summary" && !terminalSeen) {
                        terminalSeen = true;
                        options.onClosingTerminal?.();
                    }
                    yield event;
                }
            },
        },
    };
}

export function ReplayMeetingRoom({ meetingId }: { meetingId: string }) {
    const [epoch, setEpoch] = useState(1);
    const [runKey, setRunKey] = useState(1);
    const [checkpoint, setCheckpoint] = useState<string | null>(null);
    const [session, setSession] = useState<ReplaySession | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(true);
    const transitioning = useRef(false);

    const queryClient = useMemo(() => makeQueryClient(), [runKey]);
    const sessionController = useMemo(() => new AbortController(), [runKey]);
    const controller = useMemo(
        () => new AbortController(),
        [epoch, runKey]
    );
    const effectiveCheckpoint =
        checkpoint ?? session?.initial_checkpoint ?? "";
    const sessionRef = useRef(session);
    sessionRef.current = session;
    const stateRef = useRef({ epoch, checkpoint: effectiveCheckpoint });
    stateRef.current = { epoch, checkpoint: effectiveCheckpoint };

    const restart = useCallback(() => {
        setSession(null);
        setCheckpoint(null);
        setError(null);
        setLoading(true);
        setEpoch((value) => value + 1);
        setRunKey((value) => value + 1);
    }, []);

    useEffect(() => {
        let active = true;
        requestJson<unknown>("/replay/session", {
            signal: sessionController.signal,
        })
            .then((payload) => {
                if (!active) return;
                const decoded = decodeReplaySession(payload);
                if (decoded.meeting_id !== meetingId) {
                    throw new Error(
                        "This recording does not contain the requested meeting."
                    );
                }
                setSession(decoded);
                setLoading(false);
            })
            .catch((cause) => {
                if (!active || sessionController.signal.aborted) return;
                setError(
                    cause instanceof Error
                        ? cause
                        : new Error("The recording is unavailable.")
                );
                setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [meetingId, runKey, sessionController.signal]);

    useEffect(() => () => controller.abort(), [controller]);

    const switchCheckpoint = useCallback(
        async (
            next: string,
            options?: {
                expectedMessageId?: string | null;
                expectedOperationId?: string | null;
            }
        ) => {
            const current = sessionRef.current;
            if (!current) throw new Error("Replay session is not loaded.");
            if (next === stateRef.current.checkpoint) return;
            if (!current.checkpoints.includes(next)) {
                throw new Error("That checkpoint is not part of this recording.");
            }
            if (transitioning.current) {
                throw new Error("A checkpoint transition is already in progress.");
            }
            transitioning.current = true;
            const nextEpoch = stateRef.current.epoch + 1;
            const scopeId = `${current.run_id}:${current.package_version}`;
            const prefetch = new AbortController();
            try {
                const bundle = await fetchReplayBundle(
                    current,
                    meetingId,
                    next,
                    prefetch.signal
                );
                const operation = options?.expectedOperationId
                    ? bundle.turns.find(
                          (item) => item.operation_id === options.expectedOperationId
                      )
                    : null;
                if (options?.expectedOperationId && !operation) {
                    throw new Error(
                        "The completed checkpoint does not expose the recorded turn."
                    );
                }
                const expectedMessage =
                    options?.expectedMessageId ?? operation?.final_message_id ?? null;
                if (
                    expectedMessage &&
                    !(bundle.meeting.messages ?? []).some(
                        (message) => message.id === expectedMessage
                    )
                ) {
                    throw new Error(
                        "The completed checkpoint does not contain the terminal message."
                    );
                }

                const prefix = replayKeyPrefix(scopeId, nextEpoch, next);
                queryClient.setQueryData(
                    [...prefix, "meetings", "detail", meetingId],
                    bundle.meeting
                );
                queryClient.setQueryData(
                    [...prefix, "meetings", "detail", meetingId, "disagreements"],
                    bundle.disagreements
                );
                queryClient.setQueryData(
                    [...prefix, "meetings", "detail", meetingId, "consensus"],
                    bundle.consensus
                );
                queryClient.setQueryData(
                    [...prefix, "turns", meetingId],
                    bundle.turns
                );
                if (bundle.contextStats) {
                    queryClient.setQueryData(
                        [...prefix, "meetings", "detail", meetingId, "context-stats"],
                        bundle.contextStats
                    );
                }
                if (bundle.closing) {
                    queryClient.setQueryData(
                        [...prefix, "meetings", "detail", meetingId, "closing"],
                        bundle.closing
                    );
                }

                controller.abort();
                setCheckpoint(next);
                setEpoch(nextEpoch);
            } finally {
                transitioning.current = false;
            }
        },
        [controller, meetingId, queryClient]
    );

    const startIntent = useCallback(
        async (intentId: string) => {
            const current = sessionRef.current;
            if (!current) throw new Error("Replay session is not loaded.");
            const intent = current.intents.find(
                (item) => item.intent_id === intentId
            );
            if (!intent) throw new Error("That recorded intent is not available.");
            await switchCheckpoint(intent.checkpoint);
        },
        [switchCheckpoint]
    );

    if (loading) {
        return (
            <ReplayFrame title="Loading recorded session">
                <p className="text-sm text-zinc-500">
                    Fetching the replay composition and its recorded meeting.
                </p>
            </ReplayFrame>
        );
    }

    if (error || !session) {
        const notConfigured =
            isApiError(error) && error.status === 503
                ? "Recorded replay is not configured on this server."
                : null;
        return (
            <ReplayFrame title="Recorded session unavailable">
                <p className="text-sm text-zinc-400">
                    {notConfigured ?? error?.message ?? "The recording is unavailable."}
                </p>
                <button
                    type="button"
                    onClick={restart}
                    className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
                >
                    Restart replay
                </button>
            </ReplayFrame>
        );
    }

    const scope: RuntimeScope = {
        identity: {
            kind: "replay",
            id: `${session.run_id}:${session.package_version}`,
            epoch,
        },
        label: session.label,
        provenance: session.provenance,
    };
    const runtime = createReplayRuntime(session, scope, {
        signal: controller.signal,
        restart,
        checkpoint: effectiveCheckpoint,
        queryClient,
        switchCheckpoint,
        startIntent,
    });

    return (
        <QueryClientProvider client={queryClient}>
            <RuntimeScopeProvider scope={scope}>
                <MeetingsRuntimeProvider runtime={runtime}>
                    <MeetingRoom meetingId={meetingId} />
                </MeetingsRuntimeProvider>
            </RuntimeScopeProvider>
        </QueryClientProvider>
    );
}

function ReplayFrame({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
            <div className="w-full max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h1 className="text-lg font-semibold text-white">{title}</h1>
                {children}
            </div>
        </div>
    );
}
