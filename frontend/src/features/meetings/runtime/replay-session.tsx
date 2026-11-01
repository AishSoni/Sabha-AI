"use client";

/**
 * Pinned replay session provider (spec-23).
 *
 * The session read happens once per mounted demo workspace. Restarting the
 * recording resets checkpoint playback but must keep the same pinned package,
 * version, and content hash; extracting this read makes that guarantee
 * structural instead of incidental.
 */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { decodeObject } from "@/shared/api/decode";
import { isApiError } from "@/shared/api/errors";
import { requestJson, SESSION_REQUEST_RETRY } from "@/shared/api/transport";
import { decodeReplaySession, type ReplaySession } from "./replay";

export type ReplaySafeConfig = Record<string, unknown>;

interface ReplaySessionContextValue {
    session: ReplaySession;
    safeConfig: ReplaySafeConfig | null;
}

const ReplaySessionContext = createContext<ReplaySessionContextValue | null>(null);

export function useReplaySession(): ReplaySessionContextValue {
    const value = useContext(ReplaySessionContext);
    if (!value) {
        throw new Error("useReplaySession must be used inside ReplaySessionProvider.");
    }
    return value;
}

export function ReplaySessionProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<ReplaySession | null>(null);
    const [safeConfig, setSafeConfig] = useState<ReplaySafeConfig | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [attempt, setAttempt] = useState(1);

    const controller = useMemo(
        () => new AbortController(),
        // A retry gets a fresh request lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [attempt]
    );

    useEffect(() => {
        let active = true;
        requestJson<unknown>("/replay/session", {
            signal: controller.signal,
            retry: SESSION_REQUEST_RETRY,
        })
            .then((payload) => {
                if (!active) return;
                const decoded = decodeReplaySession(payload);
                setSession(decoded);
                void requestJson<unknown>(
                    `/replay/meetings/${encodeURIComponent(
                        decoded.meeting_id
                    )}/safe-config?checkpoint=${encodeURIComponent(
                        decoded.initial_checkpoint
                    )}`,
                    { signal: controller.signal }
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
                if (!active || controller.signal.aborted) return;
                setError(
                    cause instanceof Error
                        ? cause
                        : new Error("The recording is unavailable.")
                );
            });
        return () => {
            active = false;
        };
    }, [attempt, controller.signal]);

    const retry = useCallback(() => {
        setSession(null);
        setSafeConfig(null);
        setError(null);
        setAttempt((value) => value + 1);
    }, []);

    if (error) {
        const notConfigured =
            isApiError(error) && error.status === 503
                ? "Recorded replay is not configured on this server."
                : null;
        return (
            <ReplayFrame title="Guided replay unavailable">
                <p className="text-sm text-zinc-400">
                    {notConfigured ?? error.message ?? "The recording is unavailable."}
                </p>
                <button
                    type="button"
                    onClick={retry}
                    className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
                >
                    Try again
                </button>
            </ReplayFrame>
        );
    }

    if (!session) {
        return (
            <ReplayFrame title="Loading guided replay">
                <p className="text-sm text-zinc-500">
                    Fetching the recorded package and its initial checkpoint.
                </p>
            </ReplayFrame>
        );
    }

    return (
        <ReplaySessionContext.Provider value={{ session, safeConfig }}>
            {children}
        </ReplaySessionContext.Provider>
    );
}

export function ReplayFrame({
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
