"use client";

/**
 * Recorded replay runtime (spec-14).
 *
 * Every read below targets the composed `/api/replay` graph. There is no live
 * fallback, no live settings import, and no credential handoff: unsupported
 * intents reject locally because the UI hides them and the server rejects them
 * before any adapter. A restart mints a fresh epoch, query client, abort
 * signal, and projection namespace without touching live state.
 */
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
    decodeObject,
    optionalString,
    requireArray,
    requireBoolean,
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
    decodeDisagreement,
    decodeMeetingWithParticipants,
} from "../api/decoders";
import {
    decodeTurnOperation,
    type TurnOperation,
} from "../api/turn-decoders";
import { decodeTurnEventStream, type TurnEvent } from "../api/turn-events";
import { MeetingRoom } from "../components/MeetingRoom";
import type {
    MeetingsCapabilities,
    MeetingsRuntime,
} from "./contract";
import { MeetingsRuntimeProvider } from "./context";

interface ReplaySession {
    run_id: string;
    package_version: string;
    meeting_id: string;
    label: string;
    provenance: Record<string, unknown>;
    capabilities: MeetingsCapabilities;
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
        provenance: decodeObject(
            record.provenance ?? {},
            "GET /replay/session.provenance"
        ),
        capabilities: decodeCapabilities(
            record.capabilities,
            "GET /replay/session.capabilities"
        ),
    };
}

function replayTurnEventsUrl(
    meetingId: string,
    operationId: string,
    after = 0
): string {
    const base = resolveApiBaseUrl();
    return (
        `${base}/replay/meetings/${encodeURIComponent(meetingId)}` +
        `/turns/${encodeURIComponent(operationId)}/events?after=${after}`
    );
}

function replayReadonly(command: string): Promise<never> {
    return Promise.reject(
        new ApiError("http", 403, `Replay is read-only (${command}).`)
    );
}

function createReplayRuntime(
    session: ReplaySession,
    scope: RuntimeScope,
    signal: AbortSignal,
    restart: () => void
): MeetingsRuntime {
    const prefix = ["replay", scope.identity.id, scope.identity.epoch] as const;
    const meetingPath = `/replay/meetings/${encodeURIComponent(session.meeting_id)}`;

    return {
        scope,
        capabilities: session.capabilities,
        reads: {
            listMeetings: async () => [],
            getMeeting: async (meetingId, callerSignal) => {
                const payload = await requestJson<unknown>(
                    `/replay/meetings/${encodeURIComponent(meetingId)}`,
                    { signal: combineSignals(signal, callerSignal) }
                );
                return decodeMeetingWithParticipants(
                    payload,
                    "GET /replay/meetings/:id"
                );
            },
            disagreements: async (meetingId, callerSignal) => {
                const payload = await requestJson<unknown>(
                    `${meetingPath}/disagreements`,
                    { signal: combineSignals(signal, callerSignal) }
                );
                return requireArray(payload, "GET /replay/.../disagreements", decodeDisagreement);
            },
            consensus: async (meetingId, callerSignal) => {
                const payload = await requestJson<unknown>(
                    `${meetingPath}/consensus`,
                    { signal: combineSignals(signal, callerSignal) }
                );
                return requireArray(payload, "GET /replay/.../consensus", decodeConsensus);
            },
            contextStats: async () => {
                throw new ApiError(
                    "http",
                    403,
                    "Context statistics are not part of this recording."
                );
            },
        },
        turns: {
            // Recorded operation selection is package metadata (Spec 17).
            // This gate exposes observation by explicit operation id only.
            list: async () => [],
            get: async (meetingId, operationId, callerSignal) => {
                const payload = await requestJson<unknown>(
                    `/replay/meetings/${encodeURIComponent(meetingId)}/turns/${encodeURIComponent(operationId)}`,
                    { signal: combineSignals(signal, callerSignal) }
                );
                return decodeTurnOperation(payload, "GET /replay/.../turns/:id");
            },
            observe: async function* (
                meetingId: string,
                operationId: string,
                options
            ): AsyncGenerator<TurnEvent, void, unknown> {
                let response: Response;
                try {
                    response = await fetch(
                        replayTurnEventsUrl(meetingId, operationId, options.after ?? 0),
                        {
                            headers: { Accept: "text/event-stream" },
                            signal: combineSignals(signal, options.signal),
                        }
                    );
                } catch (cause) {
                    if (signal.aborted) throw cause;
                    throw cause;
                }
                yield* decodeTurnEventStream(response);
            },
            submit: async () => replayReadonly("submit turn"),
            cancel: async () => replayReadonly("cancel turn"),
        },
        commands: {
            sendMessage: async () => replayReadonly("send message"),
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
                "Recorded session. Observation is read-only; no live action is available.",
            provenance: session.provenance,
        },
        slots: {},
        signal,
        restart,
    };
}

export function ReplayMeetingRoom({ meetingId }: { meetingId: string }) {
    const [epoch, setEpoch] = useState(1);
    const [session, setSession] = useState<ReplaySession | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(true);

    const queryClient = useMemo(() => makeQueryClient(), [epoch]);
    const controller = useMemo(() => new AbortController(), [epoch]);

    const restart = useCallback(() => {
        setSession(null);
        setError(null);
        setLoading(true);
        setEpoch((value) => value + 1);
    }, []);

    useEffect(() => {
        let active = true;
        setLoading(true);
        requestJson<unknown>("/replay/session", { signal: controller.signal })
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
                if (!active || controller.signal.aborted) return;
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
    }, [controller.signal, epoch, meetingId]);

    useEffect(() => () => controller.abort(), [controller]);

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
    const runtime = createReplayRuntime(session, scope, controller.signal, restart);

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
