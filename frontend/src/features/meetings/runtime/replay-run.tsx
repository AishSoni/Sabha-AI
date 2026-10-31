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
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/shared/query/client";
import { RuntimeScopeProvider, type RuntimeScope } from "@/shared/runtime/scope";
import { useDemoWorkspace } from "@/features/demo-workspace";
import type { MeetingsRuntime } from "./contract";
import { MeetingsRuntimeProvider } from "./context";
import {
    createReplayRuntime,
    fetchReplayBundle,
    replayKeyPrefix,
    type ReplaySession,
} from "./replay";
import { useReplaySession, type ReplaySafeConfig } from "./replay-session";

export type { ReplaySafeConfig } from "./replay-session";

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
    const { session, safeConfig } = useReplaySession();
    const { playbackReset } = useDemoWorkspace();
    const [epoch, setEpoch] = useState(1);
    const [runKey, setRunKey] = useState(1);
    const [checkpoint, setCheckpoint] = useState<string | null>(null);
    const [settledIntents, setSettledIntents] = useState<Set<string>>(new Set());
    const [closingSettled, setClosingSettled] = useState(false);
    const transitioning = useRef(false);
    const startedIntentsRef = useRef<Set<string>>(new Set());

    const queryClient = useMemo(
        () => makeQueryClient(),
        // A restart gets a fresh cache; the key intentionally remounts it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [runKey]
    );
    const controller = useMemo(
        () => new AbortController(),
        // Each epoch/run owns its request lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [epoch, runKey]
    );
    const effectiveCheckpoint = checkpoint ?? session.initial_checkpoint;
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
        setCheckpoint(null);
        startedIntentsRef.current = new Set();
        clearSettled();
        setEpoch((value) => value + 1);
        setRunKey((value) => value + 1);
    }, [clearSettled]);

    const lastPlaybackReset = useRef(playbackReset.nonce);
    useEffect(() => {
        if (playbackReset.nonce === lastPlaybackReset.current) return;
        lastPlaybackReset.current = playbackReset.nonce;
        restart();
    }, [playbackReset.nonce, restart]);

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
                // The initial checkpoint is the pre-meeting snapshot: the
                // guided package deliberately exposes only safe-config there.
                // Nothing in the board or intake screens needs a meeting
                // bundle, and requesting one would turn a normal rewind into
                // a 404 (or, before the replay error handler, a 500).
                if (next === current.initial_checkpoint) {
                    if (
                        options?.expectedOperationId ||
                        options?.expectedMessageId
                    ) {
                        throw new Error(
                            "The initial checkpoint has no recorded turn snapshot."
                        );
                    }
                    controller.abort();
                    setCheckpoint(next);
                    setEpoch(nextEpoch);
                    return;
                }

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

    const scope = useMemo<RuntimeScope>(
        () => ({
            identity: {
                kind: "replay",
                id: `${session.run_id}:${session.package_version}`,
                epoch,
            },
            label: session.label,
            provenance: session.provenance,
        }),
        [session, epoch]
    );

    const runtime = useMemo(() => {
        return createReplayRuntime(session, scope, {
            signal: controller.signal,
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
        effectiveCheckpoint,
        queryClient,
        switchCheckpoint,
        startIntent,
        onTurnSettled,
        onClosingTerminal,
        isTurnVisible,
    ]);

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
