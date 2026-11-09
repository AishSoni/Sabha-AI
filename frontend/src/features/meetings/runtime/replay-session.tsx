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

export type ReplaySafeConfigStatus =
    | "idle"
    | "loading"
    | "ready"
    | "error";

interface ReplaySessionContextValue {
    session: ReplaySession;
    safeConfig: ReplaySafeConfig | null;
    safeConfigStatus: ReplaySafeConfigStatus;
    safeConfigError: Error | null;
    /** Retry the whole session read after the demo itself failed. */
    retry(): void;
    /** Retry only the required safe-config read for the pinned session. */
    retrySafeConfig(): void;
}

const ReplaySessionContext = createContext<ReplaySessionContextValue | null>(null);

export function useReplaySession(): ReplaySessionContextValue {
    const value = useContext(ReplaySessionContext);
    if (!value) {
        throw new Error("useReplaySession must be used inside ReplaySessionProvider.");
    }
    return value;
}

export function safeConfigFailureMessage(error: Error | null): string {
    if (isApiError(error)) {
        if (error.status === 404) {
            return "The recorded demo details are missing from this package.";
        }
        if (error.status === 503) {
            return "The demo details are not configured on this server.";
        }
    }
    return error?.message ?? "The recorded demo details could not be loaded.";
}

export function ReplaySessionProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<ReplaySession | null>(null);
    const [sessionError, setSessionError] = useState<Error | null>(null);
    const [safeConfig, setSafeConfig] = useState<ReplaySafeConfig | null>(null);
    const [safeConfigStatus, setSafeConfigStatus] =
        useState<ReplaySafeConfigStatus>("idle");
    const [safeConfigError, setSafeConfigError] = useState<Error | null>(null);
    const [sessionAttempt, setSessionAttempt] = useState(1);
    const [safeConfigAttempt, setSafeConfigAttempt] = useState(0);

    const sessionController = useMemo(
        () => new AbortController(),
        // A retry gets a fresh request lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sessionAttempt]
    );
    const safeConfigController = useMemo(
        () => new AbortController(),
        [safeConfigAttempt, session]
    );

    useEffect(() => {
        let active = true;
        setSessionError(null);
        requestJson<unknown>("/replay/session", {
            signal: sessionController.signal,
            retry: SESSION_REQUEST_RETRY,
        })
            .then((payload) => {
                if (!active) return;
                setSession(decodeReplaySession(payload));
            })
            .catch((cause) => {
                if (!active || sessionController.signal.aborted) return;
                setSessionError(
                    cause instanceof Error
                        ? cause
                        : new Error("The demo is unavailable.")
                );
            });
        return () => {
            active = false;
            sessionController.abort();
        };
    }, [sessionAttempt, sessionController]);

    useEffect(() => {
        if (!session) return;
        let active = true;
        setSafeConfigStatus("loading");
        setSafeConfigError(null);
        requestJson<unknown>(
            `/replay/meetings/${encodeURIComponent(
                session.meeting_id
            )}/safe-config?checkpoint=${encodeURIComponent(
                session.initial_checkpoint
            )}`,
            { signal: safeConfigController.signal }
        )
            .then((config) => {
                if (!active) return;
                setSafeConfig(
                    decodeObject(config, "GET /replay/safe-config")
                );
                setSafeConfigStatus("ready");
            })
            .catch((cause) => {
                if (!active || safeConfigController.signal.aborted) return;
                setSafeConfig(null);
                setSafeConfigError(
                    cause instanceof Error
                        ? cause
                        : new Error("The demo details are unavailable.")
                );
                setSafeConfigStatus("error");
            });
        return () => {
            active = false;
            safeConfigController.abort();
        };
    }, [session, safeConfigAttempt, safeConfigController]);

    const retry = useCallback(() => {
        setSession(null);
        setSessionError(null);
        setSafeConfig(null);
        setSafeConfigStatus("idle");
        setSafeConfigError(null);
        setSessionAttempt((value) => value + 1);
    }, []);

    const retrySafeConfig = useCallback(() => {
        setSafeConfig(null);
        setSafeConfigError(null);
        setSafeConfigStatus("loading");
        setSafeConfigAttempt((value) => value + 1);
    }, []);

    if (sessionError) {
        const notConfigured =
            isApiError(sessionError) && sessionError.status === 503
                ? "The demo is not configured on this server."
                : null;
        return (
            <ReplayFrame title="Demo unavailable">
                <p className="type-body text-ink-secondary">
                    {notConfigured ??
                        sessionError.message ??
                        "The demo is unavailable."}
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
        <ReplaySessionContext.Provider
            value={{
                session,
                safeConfig,
                safeConfigStatus,
                safeConfigError,
                retry,
                retrySafeConfig,
            }}
        >
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
