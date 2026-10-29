"use client";

/**
 * Runtime-scoped feature reads (spec-14).
 *
 * Cache identities come from the runtime, not from module singletons. A
 * replay epoch therefore cannot collide with a live record or with an older
 * replay run even when meeting and operation ids are identical.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
    Consensus,
    ContextStats,
    Disagreement,
    Meeting,
    MeetingWithParticipants,
} from "../api/decoders";
import type { TurnOperation } from "../api/turn-decoders";
import { useMeetingsRuntime } from "./context";
import { combineSignals } from "@/shared/runtime/scope";

export function useRuntimeMeeting(
    meetingId: string
): UseQueryResult<MeetingWithParticipants, Error> {
    const runtime = useMeetingsRuntime();
    return useQuery({
        queryKey: runtime.keys.meetingDetail(meetingId),
        queryFn: ({ signal }) =>
            runtime.reads.getMeeting(
                meetingId,
                combineSignals(runtime.signal, signal)
            ),
        enabled: runtime.capabilities.meetingRead && meetingId.length > 0,
    });
}

export function useRuntimeMeetingList(): UseQueryResult<Meeting[], Error> {
    const runtime = useMeetingsRuntime();
    return useQuery({
        queryKey: runtime.keys.meetingList(),
        queryFn: ({ signal }) =>
            runtime.reads.listMeetings(combineSignals(runtime.signal, signal)),
        enabled: runtime.capabilities.meetingRead,
    });
}

export function useRuntimeDisagreements(
    meetingId: string
): UseQueryResult<Disagreement[], Error> {
    const runtime = useMeetingsRuntime();
    return useQuery({
        queryKey: runtime.keys.disagreements(meetingId),
        queryFn: ({ signal }) =>
            runtime.reads.disagreements(
                meetingId,
                combineSignals(runtime.signal, signal)
            ),
        enabled:
            runtime.capabilities.disagreements &&
            runtime.capabilities.meetingRead &&
            meetingId.length > 0,
    });
}

export function useRuntimeConsensus(
    meetingId: string
): UseQueryResult<Consensus[], Error> {
    const runtime = useMeetingsRuntime();
    return useQuery({
        queryKey: runtime.keys.consensus(meetingId),
        queryFn: ({ signal }) =>
            runtime.reads.consensus(
                meetingId,
                combineSignals(runtime.signal, signal)
            ),
        enabled:
            runtime.capabilities.consensus &&
            runtime.capabilities.meetingRead &&
            meetingId.length > 0,
    });
}

export function useRuntimeContextStats(
    meetingId: string
): UseQueryResult<ContextStats, Error> {
    const runtime = useMeetingsRuntime();
    return useQuery({
        queryKey: runtime.keys.contextStats(meetingId),
        queryFn: ({ signal }) =>
            runtime.reads.contextStats(
                meetingId,
                combineSignals(runtime.signal, signal)
            ),
        enabled:
            runtime.capabilities.contextStats &&
            runtime.capabilities.meetingRead &&
            meetingId.length > 0,
    });
}

export function useRuntimeMeetingTurns(
    meetingId: string,
    enabled = true
): UseQueryResult<TurnOperation[], Error> {
    const runtime = useMeetingsRuntime();
    return useQuery({
        queryKey: runtime.keys.turnList(meetingId),
        queryFn: ({ signal }) =>
            runtime.turns.list(
                meetingId,
                combineSignals(runtime.signal, signal)
            ),
        enabled:
            runtime.capabilities.turnObservation &&
            enabled &&
            meetingId.length > 0,
        refetchInterval: (query) =>
            query.state.data?.some(
                (operation) =>
                    !["completed", "failed", "interrupted", "cancelled"].includes(
                        operation.status
                    )
            )
                ? 4_000
                : false,
    });
}
