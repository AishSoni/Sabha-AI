"use client";

/**
 * Pinned replay session provider (spec-23, spec-41).
 *
 * The provider no longer renders a standalone loading card. It always exposes
 * its children and lets the demo entry gate decide whether the introduction,
 * the composed entry shell, or the workspace is visible.
 */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import {
    clearEntryHandoff,
    fetchReplaySafeConfig,
    peekEntryHandoff,
    type DemoEntryReadiness,
    type DemoEntryStatus,
    type ReplayEntry,
} from "@/features/demo-entry";
import { isApiError } from "@/shared/api/errors";
import { requestJson, SESSION_REQUEST_RETRY } from "@/shared/api/transport";
import { decodeReplaySession, type ReplaySession } from "./replay";

export type ReplaySafeConfig = Record<string, unknown>;

export type ReplayDataStatus = DemoEntryStatus;
export type ReplaySafeConfigStatus = DemoEntryStatus;

interface ReplaySessionContextValue extends DemoEntryReadiness {
    session: ReplaySession | null;
    safeConfig: ReplaySafeConfig | null;
}

export interface ReplaySessionReadyValue {
    session: ReplaySession;
    safeConfig: ReplaySafeConfig;
    safeConfigStatus: ReplaySafeConfigStatus;
    safeConfigError: Error | null;
    retry(): void;
    retrySafeConfig(): void;
    retryEntry(): void;
}

const ReplaySessionContext = createContext<ReplaySessionContextValue | null>(null);

export function useReplaySession(): ReplaySessionContextValue {
    const value = useContext(ReplaySessionContext);
    if (!value) {
        throw new Error("useReplaySession must be used inside ReplaySessionProvider.");
    }
    return value;
}

export function useReplaySessionReady(): ReplaySessionReadyValue {
    const value = useReplaySession();
    if (
        value.sessionStatus !== "ready" ||
        value.safeConfigStatus !== "ready" ||
        !value.session ||
        !value.safeConfig
    ) {
        throw new Error(
            "useReplaySessionReady must be used after the demo entry is ready."
        );
    }
    return {
        session: value.session,
        safeConfig: value.safeConfig,
        safeConfigStatus: value.safeConfigStatus,
        safeConfigError: value.safeConfigError,
        retry: value.retry,
        retrySafeConfig: value.retrySafeConfig,
        retryEntry: value.retryEntry,
    };
}

export function safeConfigFailureMessage(error: Error | null): string {
    if (isApiError(error)) {
        if (error.status === 404) {
            return "The recorded demo details are missing from this server.";
        }
        if (error.status === 503) {
            return "The demo details are not configured on this server.";
        }
    }
    return error?.message ?? "The recorded demo details could not be loaded.";
}

export function sessionFailureMessage(error: Error | null): string {
    if (isApiError(error) && error.status === 503) {
        return "The demo is not configured on this server.";
    }
    return error?.message ?? "The demo is unavailable.";
}

interface InitialState {
    session: ReplaySession | null;
    safeConfig: ReplaySafeConfig | null;
    sessionError: Error | null;
    fromHandoff: boolean;
}

function readInitialState(): InitialState {
    const entry: ReplayEntry | null = peekEntryHandoff();
    if (!entry) {
        return {
            session: null,
            safeConfig: null,
            sessionError: null,
            fromHandoff: false,
        };
    }
    try {
        return {
            session: decodeReplaySession(entry.session),
            safeConfig: entry.safeConfig,
            sessionError: null,
            fromHandoff: true,
        };
    } catch {
        clearEntryHandoff();
        return {
            session: null,
            safeConfig: null,
            sessionError: null,
            fromHandoff: false,
        };
    }
}

export function ReplaySessionProvider({ children }: { children: ReactNode }) {
    const [initial] = useState(readInitialState);
    const [session, setSession] = useState<ReplaySession | null>(initial.session);
    const [sessionError, setSessionError] = useState<Error | null>(
        initial.sessionError
    );
    const [safeConfig, setSafeConfig] = useState<ReplaySafeConfig | null>(
        initial.safeConfig
    );
    const [safeConfigError, setSafeConfigError] = useState<Error | null>(null);
    const [sessionAttempt, setSessionAttempt] = useState(
        initial.fromHandoff ? 0 : 1
    );
    const [safeConfigAttempt, setSafeConfigAttempt] = useState(0);

    useEffect(() => {
        if (initial.fromHandoff) clearEntryHandoff();
    }, [initial.fromHandoff]);

    useEffect(() => {
        if (sessionAttempt === 0) return;
        const controller = new AbortController();
        let active = true;
        requestJson<unknown>("/replay/session", {
            signal: controller.signal,
            retry: SESSION_REQUEST_RETRY,
        })
            .then((payload) => {
                if (!active) return;
                setSession(decodeReplaySession(payload));
                setSessionError(null);
            })
            .catch((cause) => {
                if (!active || controller.signal.aborted) return;
                setSession(null);
                setSessionError(
                    cause instanceof Error
                        ? cause
                        : new Error("The demo is unavailable.")
                );
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [sessionAttempt]);

    useEffect(() => {
        if (!session || safeConfig || safeConfigError) return;
        const controller = new AbortController();
        let active = true;
        fetchReplaySafeConfig(session, { signal: controller.signal })
            .then((config) => {
                if (!active) return;
                setSafeConfig(config);
                setSafeConfigError(null);
            })
            .catch((cause) => {
                if (!active || controller.signal.aborted) return;
                setSafeConfig(null);
                setSafeConfigError(
                    cause instanceof Error
                        ? cause
                        : new Error("The demo details are unavailable.")
                );
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [safeConfig, safeConfigAttempt, safeConfigError, session]);

    const retry = useCallback(() => {
        setSession(null);
        setSessionError(null);
        setSafeConfig(null);
        setSafeConfigError(null);
        setSessionAttempt((value) => Math.max(1, value + 1));
    }, []);

    const retrySafeConfig = useCallback(() => {
        setSafeConfig(null);
        setSafeConfigError(null);
        setSafeConfigAttempt((value) => value + 1);
    }, []);

    const retryEntry = useCallback(() => {
        if (!session || sessionError) {
            retry();
        } else {
            retrySafeConfig();
        }
    }, [retry, retrySafeConfig, session, sessionError]);

    const sessionStatus: ReplayDataStatus = session
        ? "ready"
        : sessionError
          ? "error"
          : "loading";
    const safeConfigStatus: ReplaySafeConfigStatus = safeConfig
        ? "ready"
        : safeConfigError
          ? "error"
          : session
            ? "loading"
            : "idle";

    return (
        <ReplaySessionContext.Provider
            value={{
                session,
                sessionStatus,
                sessionError,
                safeConfig,
                safeConfigStatus,
                safeConfigError,
                retry,
                retrySafeConfig,
                retryEntry,
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
