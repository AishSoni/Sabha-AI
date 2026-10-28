"use client";

/**
 * Route-scoped replay run (spec-18).
 *
 * The provider owns the ephemeral package identity, checkpoint, epoch, query
 * cache, and run-level settlement signals. It lives in `/demo/layout.tsx` so
 * moving between the board, creation form, room, and list preserves the run;
 * a refresh starts at the initial checkpoint.
 */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { decodeObject } from "@/shared/api/decode";
import { isApiError } from "@/shared/api/errors";
import { requestJson } from "@/shared/api/transport";
import { makeQueryClient } from "@/shared/query/client";
import { RuntimeScopeProvider, type RuntimeScope } from "@/shared/runtime/scope";
import type { MeetingsRuntime } from "./contract";
import { MeetingsRuntimeProvider } from "./context";
import {
    createReplayRuntime,
    decodeReplaySession,
    fetchReplayBundle,
    replayKeyPrefix,
    type ReplaySession,
} from "./replay";

export type ReplaySafeConfig = Record<string, unknown>;

interface ReplayRunContextValue {
    session: ReplaySession;
    runtime: MeetingsRuntime;
    safeConfig: ReplaySafeConfig | null;
    checkpoint: string;
    epoch: number;
    settledIntents: ReadonlySet<string>;
    closingSettled: boolean;
    switchCheckpoint: (
        next: string,
        options?: {
            expectedMessageId?: string | null;
            expectedOperationId?: string | null;
        }
    ) => Promise<void>;
    startIntent: (intentId: string) => Promise<void>;
    restart: () => void;
    clearSettled: () => void;
}

const ReplayRunContext = createContext<ReplayRunContextValue | null>(null);

export function useReplayRun(): ReplayRunContextValue {
    const value = useContext(ReplayRunContext);
    if (!value) {
        throw new Error("useReplayRun must be used inside ReplayRunProvider.");
    }
    return value;
}

export function ReplayRunProvider({ children }: { children: ReactNode }) {
    const [epoch, setEpoch] = useState(1);
    const [runKey, setRunKey] = useState(1);
    const [checkpoint, setCheckpoint] = useState<string | null>(null);
    const [session, setSession] = useState<ReplaySession | null>(null);
    const [safeConfig, setSafeConfig] = useState<ReplaySafeConfig | null>(null);
    const [settledIntents, setSettledIntents] = useState<Set<string>>(new Set());
    const [closingSettled, setClosingSettled] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(true);
    const transitioning = useRef(false);
    const startedIntentsRef = useRef<Set<string>>(new Set());

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

    const clearSettled = useCallback(() => {
        setSettledIntents(new Set());
        setClosingSettled(false);
    }, []);

    const isTurnVisible = useCallback((operationId: string) => {
        const current = sessionRef.current;
        if (!current) return true;
        const intent = current.intents.find(
            (item) => item.operation_id === operationId
        );
        if (!intent) return true;
        return startedIntentsRef.current.has(intent.intent_id);
    }, []);

    const restart = useCallback(() => {
        setSession(null);
        setCheckpoint(null);
        setSafeConfig(null);
        setError(null);
        setLoading(true);
        startedIntentsRef.current = new Set();
        clearSettled();
        setEpoch((value) => value + 1);
        setRunKey((value) => value + 1);
    }, [clearSettled]);

    useEffect(() => {
        let active = true;
        requestJson<unknown>("/replay/session", {
            signal: sessionController.signal,
        })
            .then((payload) => {
                if (!active) return;
                const decoded = decodeReplaySession(payload);
                setSession(decoded);
                setLoading(false);
                void requestJson<unknown>(
                    `/replay/meetings/${encodeURIComponent(
                        decoded.meeting_id
                    )}/safe-config?checkpoint=${encodeURIComponent(
                        decoded.initial_checkpoint
                    )}`,
                    { signal: sessionController.signal }
                )
                    .then((config) => {
                        if (active) {
                            setSafeConfig(
                                decodeObject(config, "GET /replay/safe-config")
                            );
                        }
                    })
                    .catch(() => {
                        if (active) setSafeConfig(null);
                    });
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
    }, [runKey, sessionController.signal]);

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
                    current.meeting_id,
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
                const meetingId = current.meeting_id;
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
                const terminal = new Set([
                    "completed",
                    "failed",
                    "interrupted",
                    "cancelled",
                ]);
                queryClient.setQueryData(
                    [...prefix, "turns", meetingId],
                    bundle.turns.filter(
                        (operation) =>
                            terminal.has(operation.status) ||
                            isTurnVisible(operation.operation_id)
                    )
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
        [controller, queryClient, isTurnVisible]
    );

    const startIntent = useCallback(
        async (intentId: string) => {
            const current = sessionRef.current;
            if (!current) throw new Error("Replay session is not loaded.");
            const intent = current.intents.find(
                (item) => item.intent_id === intentId
            );
            if (!intent) throw new Error("That recorded intent is not available.");
            startedIntentsRef.current = new Set(startedIntentsRef.current).add(
                intent.intent_id
            );
            if (intent.kind === "request_closing") {
                const closingBeat = current.beats.find((beat) =>
                    beat.steps.some((step) => step.intent_id === intent.intent_id)
                );
                if (!closingBeat?.completed_checkpoint) {
                    throw new Error(
                        "The recorded closing does not declare a completed checkpoint."
                    );
                }
                await switchCheckpoint(closingBeat.completed_checkpoint);
                setSettledIntents((previous) => {
                    const next = new Set(previous);
                    next.add(intent.intent_id);
                    return next;
                });
                setClosingSettled(true);
                return;
            }
            await switchCheckpoint(intent.checkpoint);
            const visibleState = stateRef.current;
            const scopeId = `${current.run_id}:${current.package_version}`;
            void queryClient.invalidateQueries({
                queryKey: [
                    ...replayKeyPrefix(
                        scopeId,
                        visibleState.epoch,
                        visibleState.checkpoint
                    ),
                    "turns",
                    current.meeting_id,
                ],
            });
            if (
                intent.kind === "create_meeting" ||
                intent.kind === "archive_meeting" ||
                intent.kind === "director_follow_up"
            ) {
                setSettledIntents((previous) => {
                    const next = new Set(previous);
                    next.add(intent.intent_id);
                    return next;
                });
            }
        },
        [switchCheckpoint, queryClient]
    );

    const onTurnSettled = useCallback((intentId: string) => {
        setSettledIntents((previous) => {
            const next = new Set(previous);
            next.add(intentId);
            return next;
        });
    }, []);

    const onClosingTerminal = useCallback(() => {
        setClosingSettled(true);
    }, []);

    const scope: RuntimeScope | null = session
        ? {
              identity: {
                  kind: "replay",
                  id: `${session.run_id}:${session.package_version}`,
                  epoch,
              },
              label: session.label,
              provenance: session.provenance,
          }
        : null;

    const runtime = useMemo(() => {
        if (!session || !scope) return null;
        return createReplayRuntime(session, scope, {
            signal: controller.signal,
            restart,
            checkpoint: effectiveCheckpoint,
            queryClient,
            switchCheckpoint,
            startIntent,
            onTurnSettled,
            onClosingTerminal,
            isTurnVisible,
        });
    }, [
        session,
        scope,
        controller.signal,
        restart,
        effectiveCheckpoint,
        queryClient,
        switchCheckpoint,
        startIntent,
        onTurnSettled,
        onClosingTerminal,
        isTurnVisible,
    ]);

    if (loading) {
        return (
            <ReplayFrame title="Loading guided replay">
                <p className="text-sm text-zinc-500">
                    Fetching the recorded package and its initial checkpoint.
                </p>
            </ReplayFrame>
        );
    }

    if (error || !session || !runtime || !scope) {
        const notConfigured =
            isApiError(error) && error.status === 503
                ? "Recorded replay is not configured on this server."
                : null;
        return (
            <ReplayFrame title="Guided replay unavailable">
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

    const value: ReplayRunContextValue = {
        session,
        runtime,
        safeConfig,
        checkpoint: effectiveCheckpoint,
        epoch,
        settledIntents,
        closingSettled,
        switchCheckpoint,
        startIntent,
        restart,
        clearSettled,
    };

    return (
        <ReplayRunContext.Provider value={value}>
            <QueryClientProvider client={queryClient}>
                <RuntimeScopeProvider scope={scope}>
                    <MeetingsRuntimeProvider runtime={runtime}>
                        {children}
                    </MeetingsRuntimeProvider>
                </RuntimeScopeProvider>
            </QueryClientProvider>
        </ReplayRunContext.Provider>
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
