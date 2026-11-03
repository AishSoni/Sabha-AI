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
    type ReplayBundle,
    type ReplaySession,
    type ReplayTransitionOutcome,
} from "./replay";
import {
    FOLLOW_UP_STEP,
    canCloseDeck,
    composedBundle,
    composedTurns,
    emptyPreparedDeck,
    followUpTurn,
    replyTurnForOperation,
    replyTurns,
    turnById,
    type PreparedDeckState,
} from "./prepared-deck";
import { useReplaySession, type ReplaySafeConfig } from "./replay-session";

export type { ReplaySafeConfig } from "./replay-session";

interface ReplayRunContextValue {
    session: ReplaySession;
    runtime: MeetingsRuntime;
    safeConfig: ReplaySafeConfig | null;
    checkpoint: string;
    epoch: number;
    runGeneration: number;
    settledIntents: ReadonlySet<string>;
    startedIntents: ReadonlySet<string>;
    acknowledgedBeats: ReadonlySet<string>;
    closingCompleted: boolean;
    switchCheckpoint: (
        next: string,
        options?: {
            expectedMessageId?: string | null;
            expectedOperationId?: string | null;
            force?: boolean;
            signal?: AbortSignal;
        }
    ) => Promise<ReplayTransitionOutcome>;
    startIntent: (intentId: string) => Promise<void>;
    skipIntent: (intentId: string) => Promise<void>;
    replayIntent: (intentId: string) => Promise<void>;
    goToChapter: (
        chapterId: string,
        options?: { force?: boolean; signal?: AbortSignal }
    ) => Promise<void>;
    acknowledgeBeat: (beatId: string) => void;
    playbackSpeed: 1 | 2;
    setPlaybackSpeed: (speed: 1 | 2) => void;
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
    const [runGeneration, setRunGeneration] = useState(0);
    const [checkpoint, setCheckpoint] = useState<string | null>(null);
    const [settledIntents, setSettledIntents] = useState<Set<string>>(new Set());
    const [startedIntents, setStartedIntents] = useState<Set<string>>(new Set());
    const [acknowledgedBeats, setAcknowledgedBeats] = useState<Set<string>>(
        new Set()
    );
    const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2>(1);
    const activeTransition = useRef<number | null>(null);
    const transitionSequence = useRef(0);
    const startedIntentsRef = useRef<Set<string>>(new Set());
    const generationRef = useRef(0);

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
    const deckController = useMemo(
        () => new AbortController(),
        // Deck reads survive checkpoint epoch changes; only a restart replaces
        // the browser-memory composition.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [runKey]
    );
    const deckEnabled =
        session.prepared_turns.length > 0 && session.prepared_closing !== null;
    const effectiveCheckpoint =
        checkpoint ??
        session.prepared_base_checkpoint ??
        session.initial_checkpoint;
    const sessionRef = useRef(session);
    sessionRef.current = session;
    const stateRef = useRef({ epoch, checkpoint: effectiveCheckpoint });
    stateRef.current = { epoch, checkpoint: effectiveCheckpoint };
    const [deckVersion, setDeckVersion] = useState(0);
    const deckRef = useRef<PreparedDeckState | null>(null);
    const deckBasePromise = useRef<Promise<ReplayBundle> | null>(null);

    const ensureDeckBase = useCallback(async (): Promise<PreparedDeckState> => {
        if (deckRef.current) return deckRef.current;
        const baseCheckpoint = session.prepared_base_checkpoint;
        if (!baseCheckpoint) {
            throw new Error("The prepared turn deck has no base checkpoint.");
        }
        if (!deckBasePromise.current) {
            deckBasePromise.current = fetchReplayBundle(
                session,
                session.meeting_id,
                baseCheckpoint,
                deckController.signal
            ).catch((cause) => {
                deckBasePromise.current = null;
                throw cause;
            });
        }
        const base = await deckBasePromise.current;
        if (!deckRef.current) {
            deckRef.current = emptyPreparedDeck(base);
            setDeckVersion((value) => value + 1);
        }
        return deckRef.current;
    }, [deckController.signal, session]);

    useEffect(() => {
        if (!deckEnabled) return;
        void ensureDeckBase().catch(() => {
            // The room's normal error boundary surfaces an unavailable package.
        });
    }, [deckEnabled, ensureDeckBase]);

    /**
     * Ending the recorded vote installs the canonical closing checkpoint.
     * That checkpoint is terminal evidence that step 7 is over, even when the
     * visitor reached it through the completed-closing inspection chapter.
     * Playback terminal events only animate the closing and never gate it.
     */
    const canonicalClosing = useMemo(() => {
        return session.transitions.find(
            (transition) =>
                transition.kind === "request_closing" && transition.canonical
        );
    }, [session.transitions]);

    const deckPlayedTurnIds = useMemo(() => {
        const state = deckRef.current;
        if (!state) return new Set<string>();
        const played = new Set(Object.keys(state.results));
        const followUp = followUpTurn(session);
        if (state.followUpSent && followUp) played.add(followUp.turn_id);
        return played;
        // deckVersion is the observable fence for the mutable composition.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckVersion, session]);

    const deckCanClose =
        deckEnabled &&
        !deckRef.current?.closing &&
        canCloseDeck(session, deckPlayedTurnIds);

    const closingCompleted = useMemo(() => {
        if (deckEnabled) return Boolean(deckRef.current?.closing);
        if (!canonicalClosing) return false;
        return (
            settledIntents.has(canonicalClosing.intent_id) ||
            effectiveCheckpoint === canonicalClosing.completed_checkpoint
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        canonicalClosing,
        deckEnabled,
        deckVersion,
        effectiveCheckpoint,
        settledIntents,
    ]);

    const settleIntent = useCallback((intentId: string) => {
        setSettledIntents((previous) => {
            if (previous.has(intentId)) return previous;
            const next = new Set(previous);
            next.add(intentId);
            return next;
        });
    }, []);

    useEffect(() => {
        if (
            canonicalClosing &&
            effectiveCheckpoint === canonicalClosing.completed_checkpoint
        ) {
            settleIntent(canonicalClosing.intent_id);
        }
    }, [canonicalClosing, effectiveCheckpoint, settleIntent]);

    const clearSettled = useCallback(() => {
        setSettledIntents(new Set());
    }, []);

    const markStarted = useCallback((intentId: string, started: boolean) => {
        const next = new Set(startedIntentsRef.current);
        if (started) next.add(intentId);
        else next.delete(intentId);
        startedIntentsRef.current = next;
        setStartedIntents(next);
    }, []);

    const acknowledgeBeat = useCallback((beatId: string) => {
        setAcknowledgedBeats((current) => {
            if (current.has(beatId)) return current;
            const next = new Set(current);
            next.add(beatId);
            return next;
        });
    }, []);

    const deckPrefix = useCallback(
        () =>
            replayKeyPrefix(
                `${session.run_id}:${session.package_version}`,
                stateRef.current.epoch,
                stateRef.current.checkpoint
            ),
        [session.package_version, session.run_id]
    );

    const invalidateDeckReads = useCallback(() => {
        const prefix = deckPrefix();
        void queryClient.invalidateQueries({
            queryKey: [...prefix, "turns", session.meeting_id],
        });
        void queryClient.invalidateQueries({
            queryKey: [...prefix, "meetings", "detail", session.meeting_id],
        });
    }, [deckPrefix, queryClient, session.meeting_id]);

    const commitDeck = useCallback(
        (next: PreparedDeckState) => {
            deckRef.current = next;
            setDeckVersion((value) => value + 1);
        },
        []
    );

    const mergeDeckResult = useCallback(
        (turnId: string, result: ReplayBundle) => {
            const current = deckRef.current;
            if (!current) return;
            const turn = turnById(session, turnId);
            if (!turn || turn.kind !== "reply") return;
            const already = current.order.includes(turnId);
            const order = already
                ? current.order
                : [...current.order, turnId];
            commitDeck({
                ...current,
                order,
                results: { ...current.results, [turnId]: result },
                activeTurnId: null,
                lastCompletedTurnId: turnId,
            });
            settleIntent(turn.intent_id);
            markStarted(turn.intent_id, false);
            invalidateDeckReads();
        },
        [
            commitDeck,
            invalidateDeckReads,
            markStarted,
            session,
            settleIntent,
        ]
    );

    const settleDeckOperation = useCallback(
        async (operationId: string): Promise<boolean> => {
            const turn = replyTurnForOperation(session, operationId);
            if (!turn) return false;
            const current = deckRef.current;
            if (current?.results[turn.turn_id]) {
                if (current.activeTurnId === turn.turn_id) {
                    commitDeck({ ...current, activeTurnId: null });
                }
                return true;
            }
            const result = await fetchReplayBundle(
                session,
                session.meeting_id,
                turn.result_checkpoint,
                deckController.signal
            );
            mergeDeckResult(turn.turn_id, result);
            return true;
        },
        [commitDeck, deckController.signal, mergeDeckResult, session]
    );

    const startPreparedTurn = useCallback(
        async (turnId: string) => {
            const state = await ensureDeckBase();
            const turn = turnById(session, turnId);
            if (!turn || turn.kind !== "reply") {
                throw new Error("That prepared turn is not part of this recording.");
            }
            if (state.results[turnId] || state.activeTurnId) return;
            markStarted(turn.intent_id, true);
            commitDeck({ ...state, activeTurnId: turnId });
            invalidateDeckReads();
        },
        [
            commitDeck,
            ensureDeckBase,
            invalidateDeckReads,
            markStarted,
            session,
        ]
    );

    const skipPreparedTurn = useCallback(
        async (turnId: string) => {
            const state = await ensureDeckBase();
            if (state.results[turnId]) return;
            const turn = turnById(session, turnId);
            if (!turn || turn.kind !== "reply") {
                throw new Error("That prepared result is not available.");
            }
            const result = await fetchReplayBundle(
                session,
                session.meeting_id,
                turn.result_checkpoint,
                deckController.signal
            );
            mergeDeckResult(turnId, result);
        },
        [deckController.signal, ensureDeckBase, mergeDeckResult, session]
    );

    const replayPreparedTurn = useCallback(
        async (turnId: string) => {
            const state = await ensureDeckBase();
            const turn = turnById(session, turnId);
            if (!turn || turn.kind !== "reply" || !state.results[turnId]) {
                throw new Error("That prepared turn cannot be replayed.");
            }
            if (state.activeTurnId) return;
            markStarted(turn.intent_id, true);
            commitDeck({ ...state, activeTurnId: turnId });
            invalidateDeckReads();
        },
        [
            commitDeck,
            ensureDeckBase,
            invalidateDeckReads,
            markStarted,
            session,
        ]
    );

    const showFullPreparedResponse = useCallback(async () => {
        const state = await ensureDeckBase();
        if (!state.activeTurnId) return;
        const turnId = state.activeTurnId;
        const turn = turnById(session, turnId);
        if (!turn || turn.kind !== "reply") return;
        const result = await fetchReplayBundle(
            session,
            session.meeting_id,
            turn.result_checkpoint,
            deckController.signal
        );
        mergeDeckResult(turnId, result);
    }, [deckController.signal, ensureDeckBase, mergeDeckResult, session]);

    const sendFollowUp = useCallback(async () => {
        const state = await ensureDeckBase();
        const turn = followUpTurn(session);
        if (!turn || state.followUpSent) return;
        commitDeck({
            ...state,
            order: [...state.order, FOLLOW_UP_STEP],
            followUpSent: true,
        });
        if (turn.intent_id) settleIntent(turn.intent_id);
        invalidateDeckReads();
    }, [commitDeck, ensureDeckBase, invalidateDeckReads, session, settleIntent]);

    const startPreparedClosing = useCallback(async () => {
        const state = await ensureDeckBase();
        if (state.closing) return;
        const closing = session.prepared_closing;
        if (!closing) throw new Error("This recording has no prepared closing.");
        const played = new Set([
            ...Object.keys(state.results),
            ...(state.followUpSent
                ? [followUpTurn(session)?.turn_id].filter(
                      (value): value is string => Boolean(value)
                  )
                : []),
        ]);
        if (!canCloseDeck(session, played)) {
            throw new Error(
                "Play every prepared reply and send the follow-up before closing."
            );
        }
        const bundle = await fetchReplayBundle(
            session,
            session.meeting_id,
            closing.completed_checkpoint,
            deckController.signal
        );
        commitDeck({ ...state, closing: bundle, archived: false });
        invalidateDeckReads();
    }, [
        commitDeck,
        deckController.signal,
        ensureDeckBase,
        invalidateDeckReads,
        session,
    ]);

    const archivePreparedMeeting = useCallback(async () => {
        const state = await ensureDeckBase();
        const closing = session.prepared_closing;
        if (!closing || !state.closing || state.archived) return;
        const bundle = await fetchReplayBundle(
            session,
            session.meeting_id,
            closing.archived_checkpoint,
            deckController.signal
        );
        commitDeck({ ...state, closing: bundle, archived: true });
        invalidateDeckReads();
    }, [
        commitDeck,
        deckController.signal,
        ensureDeckBase,
        invalidateDeckReads,
        session,
    ]);

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
        generationRef.current += 1;
        // Invalidate any checkpoint install still in flight. Its generation
        // fence prevents cache/progress writes, and its token can no longer
        // clear the lock of a newer transition.
        transitionSequence.current += 1;
        activeTransition.current = null;
        setRunGeneration(generationRef.current);
        setCheckpoint(null);
        startedIntentsRef.current = new Set();
        setStartedIntents(new Set());
        setAcknowledgedBeats(new Set());
        deckRef.current = null;
        deckBasePromise.current = null;
        setDeckVersion((value) => value + 1);
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



    const transitionToCheckpoint = useCallback(
        async (
            next: string,
            options?: {
                expectedMessageId?: string | null;
                expectedOperationId?: string | null;
                force?: boolean;
                signal?: AbortSignal;
            }
        ): Promise<ReplayTransitionOutcome> => {
            const current = sessionRef.current;
            if (!current) throw new Error("Replay session is not loaded.");
            if (next === stateRef.current.checkpoint && !options?.force) {
                return "unchanged";
            }
            if (!current.checkpoints.includes(next)) {
                throw new Error("That checkpoint is not part of this recording.");
            }
            if (options?.signal?.aborted) return "aborted";
            if (activeTransition.current !== null) {
                throw new Error("A checkpoint transition is already in progress.");
            }
            const transitionToken = transitionSequence.current + 1;
            transitionSequence.current = transitionToken;
            activeTransition.current = transitionToken;
            const generation = generationRef.current;
            const nextEpoch = stateRef.current.epoch + 1;
            const scopeId = `${current.run_id}:${current.package_version}`;
            const prefetch = new AbortController();
            const abortPrefetch = () => prefetch.abort();
            options?.signal?.addEventListener("abort", abortPrefetch, {
                once: true,
            });
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
                    stateRef.current = { epoch: nextEpoch, checkpoint: next };
                    setCheckpoint(next);
                    setEpoch(nextEpoch);
                    return "committed";
                }

                const bundle = await fetchReplayBundle(
                    current,
                    current.meeting_id,
                    next,
                    prefetch.signal
                );
                if (generationRef.current !== generation) return "superseded";
                if (options?.signal?.aborted) return "aborted";
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
                stateRef.current = { epoch: nextEpoch, checkpoint: next };
                setCheckpoint(next);
                setEpoch(nextEpoch);
                return "committed";
            } finally {
                options?.signal?.removeEventListener("abort", abortPrefetch);
                if (activeTransition.current === transitionToken) {
                    activeTransition.current = null;
                }
            }
        },
        [controller, queryClient, isTurnVisible]
    );

    /**
     * Public navigation exposes the explicit outcome so page-level callers can
     * avoid navigating to a destination that a reset already superseded.
     */
    const switchCheckpoint = useCallback(
        async (
            next: string,
            options?: {
                expectedMessageId?: string | null;
                expectedOperationId?: string | null;
                force?: boolean;
                signal?: AbortSignal;
            }
        ) => transitionToCheckpoint(next, options),
        [transitionToCheckpoint]
    );

    const startIntent = useCallback(
        async (intentId: string) => {
            const current = sessionRef.current;
            if (!current) throw new Error("Replay session is not loaded.");
            const intent = current.intents.find(
                (item) => item.intent_id === intentId
            );
            if (!intent) throw new Error("That recorded intent is not available.");
            if (deckEnabled) {
                const prepared = current.prepared_turns.find(
                    (turn) => turn.intent_id === intentId
                );
                if (prepared?.kind === "reply") {
                    await startPreparedTurn(prepared.turn_id);
                    return;
                }
                if (prepared?.kind === "follow_up") {
                    await sendFollowUp();
                    return;
                }
                if (intent.kind === "request_closing") {
                    await startPreparedClosing();
                    return;
                }
                if (intent.kind === "create_meeting") {
                    return;
                }
            }
            const transition = current.transitions.find(
                (item) => item.intent_id === intent.intent_id
            );
            if (
                transition &&
                transition.source_checkpoint !== stateRef.current.checkpoint
            ) {
                throw new Error(
                    "That prepared action is not available from this recorded moment."
                );
            }
            const generation = generationRef.current;
            markStarted(intent.intent_id, true);
            try {
                const commit = async (target: string) => {
                    const outcome = await transitionToCheckpoint(target);
                    return outcome === "committed" || outcome === "unchanged";
                };

                if (intent.kind === "request_closing") {
                    const closingBeat = current.beats.find((beat) =>
                        beat.steps.some(
                            (step) => step.intent_id === intent.intent_id
                        )
                    );
                    const completed =
                        transition?.completed_checkpoint ??
                        closingBeat?.completed_checkpoint;
                    if (!completed) {
                        throw new Error(
                            "The recorded closing does not declare a completed checkpoint."
                        );
                    }
                    if (!(await commit(completed))) {
                        if (generationRef.current === generation) {
                            markStarted(intent.intent_id, false);
                        }
                        return;
                    }
                    if (generationRef.current !== generation) return;
                    settleIntent(intent.intent_id);
                    return;
                }

                const source = transition?.source_checkpoint ?? intent.checkpoint;
                const completed =
                    transition?.completed_checkpoint ?? intent.checkpoint;
                const completesWithoutTape =
                    !transition?.tape_id &&
                    Boolean(completed) &&
                    intent.kind !== "start_participant";
                const committed = await commit(
                    completesWithoutTape && completed ? completed : source
                );
                if (!committed || generationRef.current !== generation) {
                    if (generationRef.current === generation) {
                        markStarted(intent.intent_id, false);
                    }
                    return;
                }
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
                if (completesWithoutTape) {
                    settleIntent(intent.intent_id);
                }
            } catch (cause) {
                if (generationRef.current === generation) {
                    markStarted(intent.intent_id, false);
                }
                throw cause;
            }
        },
        [
            deckEnabled,
            markStarted,
            sendFollowUp,
            startPreparedClosing,
            startPreparedTurn,
            settleIntent,
            transitionToCheckpoint,
            queryClient,
        ]
    );

    const skipIntent = useCallback(
        async (intentId: string) => {
            const current = sessionRef.current;
            if (!current) throw new Error("Replay session is not loaded.");
            if (deckEnabled) {
                const prepared = current.prepared_turns.find(
                    (turn) => turn.intent_id === intentId
                );
                if (prepared?.kind === "reply") {
                    await skipPreparedTurn(prepared.turn_id);
                    return;
                }
            }
            const transition = current.transitions.find(
                (item) => item.intent_id === intentId
            );
            if (!transition) {
                throw new Error("That prepared result is not available.");
            }
            if (
                transition.source_checkpoint !== stateRef.current.checkpoint &&
                !(
                    transition.completed_checkpoint ===
                        stateRef.current.checkpoint &&
                    startedIntentsRef.current.has(intentId)
                )
            ) {
                throw new Error(
                    "That prepared result is not available from this recorded moment."
                );
            }
            const generation = generationRef.current;
            if (
                transition.completed_checkpoint === stateRef.current.checkpoint &&
                startedIntentsRef.current.has(intentId)
            ) {
                settleIntent(intentId);
                return;
            }
            const outcome = await transitionToCheckpoint(
                transition.completed_checkpoint,
                {
                    expectedOperationId: transition.operation_id,
                    force: true,
                }
            );
            if (outcome !== "committed" && outcome !== "unchanged") return;
            if (generationRef.current !== generation) return;
            // Skip and a naturally observed terminal share this settlement
            // path. Closing progress therefore lives on the intent ledger, not
            // in a separate room-local flag.
            settleIntent(intentId);
        },
        [deckEnabled, settleIntent, skipPreparedTurn, transitionToCheckpoint]
    );

    const replayIntent = useCallback(
        async (intentId: string) => {
            const current = sessionRef.current;
            if (!current) throw new Error("Replay session is not loaded.");
            if (deckEnabled) {
                const prepared = current.prepared_turns.find(
                    (turn) => turn.intent_id === intentId
                );
                if (prepared?.kind === "reply") {
                    await replayPreparedTurn(prepared.turn_id);
                    return;
                }
            }
            const transition = current.transitions.find(
                (item) => item.intent_id === intentId
            );
            if (!transition) {
                throw new Error("That prepared turn cannot be replayed.");
            }
            const generation = generationRef.current;
            const outcome = await transitionToCheckpoint(
                transition.source_checkpoint,
                { force: true }
            );
            if (outcome !== "committed" && outcome !== "unchanged") return;
            if (generationRef.current !== generation) return;
            markStarted(intentId, false);
            await startIntent(intentId);
        },
        [
            deckEnabled,
            markStarted,
            replayPreparedTurn,
            startIntent,
            transitionToCheckpoint,
        ]
    );

    const goToChapter = useCallback(
        async (chapterId: string, options?: { force?: boolean; signal?: AbortSignal }) => {
            const current = sessionRef.current;
            if (!current) throw new Error("Replay session is not loaded.");
            const chapter = current.chapters.find(
                (item) => item.chapter_id === chapterId
            );
            if (!chapter) throw new Error("That recorded chapter is unavailable.");
            await switchCheckpoint(chapter.checkpoint, {
                force: options?.force ?? false,
                signal: options?.signal,
            });
        },
        [switchCheckpoint]
    );


    /**
     * Settlement is accepted only for an action this run actually started.
     * Replaying or inspecting a completed snapshot cannot create progress, and
     * a chapter's closing stream cannot complete the canonical close.
     */
    const onTurnSettled = useCallback(
        (intentId: string) => {
            if (!startedIntentsRef.current.has(intentId)) return;
            settleIntent(intentId);
        },
        [settleIntent]
    );

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
        const generation = generationRef.current;
        const value = createReplayRuntime(session, scope, {
            signal: controller.signal,
            checkpoint: effectiveCheckpoint,
            queryClient,
            switchCheckpoint: transitionToCheckpoint,
            startIntent,
            skipIntent,
            replayIntent,
            goToChapter,
            playbackSpeed,
            setPlaybackSpeed,
            settledIntents,
            onTurnSettled: (intentId) => {
                if (generationRef.current !== generation) return;
                onTurnSettled(intentId);
            },
            isTurnVisible,
        });
        if (
            !deckEnabled ||
            (session.prepared_base_checkpoint !== null &&
                effectiveCheckpoint !== session.prepared_base_checkpoint)
        ) {
            return value;
        }
        const getState = async () => ensureDeckBase();
        value.reads.getMeeting = async () =>
            composedBundle(session, await getState()).meeting;
        value.reads.disagreements = async () =>
            composedBundle(session, await getState()).disagreements;
        value.reads.consensus = async () =>
            composedBundle(session, await getState()).consensus;
        value.reads.contextStats = async () => {
            const stats = composedBundle(session, await getState()).contextStats;
            if (!stats) {
                throw new Error("Context statistics are not part of this recording.");
            }
            return stats;
        };
        value.reads.closing = async () => {
            const closing = composedBundle(session, await getState()).closing;
            if (!closing) {
                throw new Error("Closing is not part of this recording.");
            }
            return closing;
        };
        const listMeetings = value.reads.listMeetings;
        value.reads.listMeetings = async (signal) => {
            const rows = await listMeetings(signal);
            const composed = composedBundle(session, await getState()).meeting;
            return rows.map((row) =>
                row.id === composed.id
                    ? { ...row, status: composed.status }
                    : row
            );
        };
        value.turns.list = async () =>
            composedTurns(session, await getState());
        value.turns.get = async (_meetingId, operationId) => {
            const operation = composedTurns(session, await getState()).find(
                (item) => item.operation_id === operationId
            );
            if (!operation) {
                throw new Error("Recorded turn not found.");
            }
            return operation;
        };
        value.settlement = {
            beforeTerminal: async ({ operationId }) => {
                await settleDeckOperation(operationId);
            },
        };
        const state = deckRef.current;
        const activeTurn = state?.activeTurnId
            ? turnById(session, state.activeTurnId)
            : null;
        value.replay = {
            ...value.replay!,
            playedTurnIds: deckPlayedTurnIds,
            activePreparedOperationId:
                activeTurn?.kind === "reply" ? activeTurn.operation_id : null,
            lastCompletedTurnId: state?.lastCompletedTurnId ?? null,
            canClose: deckCanClose,
            closeReason: deckCanClose
                ? null
                : "Play all four replies and send the follow-up to close.",
            startPreparedTurn,
            sendFollowUp,
            replayPreparedTurn,
            showFullPreparedResponse,
            startPreparedClosing,
            archivePreparedMeeting,
        };
        void replyTurns;
        return value;
    }, [
        session,
        scope,
        controller.signal,
        effectiveCheckpoint,
        queryClient,
        transitionToCheckpoint,
        startIntent,
        skipIntent,
        replayIntent,
        goToChapter,
        playbackSpeed,
        settledIntents,
        onTurnSettled,
        isTurnVisible,
        deckEnabled,
        deckCanClose,
        deckPlayedTurnIds,
        ensureDeckBase,
        settleDeckOperation,
        startPreparedTurn,
        sendFollowUp,
        replayPreparedTurn,
        showFullPreparedResponse,
        startPreparedClosing,
        archivePreparedMeeting,
    ]);

    const value: ReplayRunContextValue = {
        session,
        runtime,
        safeConfig,
        checkpoint: effectiveCheckpoint,
        epoch,
        runGeneration,
        settledIntents,
        startedIntents,
        acknowledgedBeats,
        closingCompleted,
        switchCheckpoint,
        startIntent,
        skipIntent,
        replayIntent,
        goToChapter,
        acknowledgeBeat,
        playbackSpeed,
        setPlaybackSpeed,
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
