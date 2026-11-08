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
                        : new Error("The demo is unavailable.")
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
                ? "The demo is not configured on this server."
                : null;
        return (
            <ReplayFrame title="Demo unavailable">
                <p className="type-body text-ink-secondary">
                    {notConfigured ?? error.message ?? "The demo is unavailable."}
                </p>
                <button
                    type="button"
                    onClick={retry}
                    className="m-control inline-flex min-h-10 items-center rounded-control border border-control bg-surface px-4 type-control text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                    Try again
                </button>
            </ReplayFrame>
        );
    }

    if (!session) {
        return (
            <ReplayFrame title="Loading demo">
                <p className="type-body text-ink-muted">
                    Fetching the demo package and its initial checkpoint.
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
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-ink">
            <div className="w-full max-w-md space-y-4 rounded-group border border-separator bg-surface p-6">
                <h1 className="type-item-title">{title}</h1>
                {children}
            </div>
        </div>
    );
}
