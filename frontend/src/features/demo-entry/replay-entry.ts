import { decodeObject } from "@/shared/api/decode";
import { isApiError } from "@/shared/api/errors";
import { requestJson, SESSION_REQUEST_RETRY } from "@/shared/api/transport";

/**
 * Shared acquisition for the demo entry (spec-41).
 *
 * The homepage CTA and a direct visit both need the same two reads: the pinned
 * replay session, then the safe config for that session's initial checkpoint.
 * Keeping the sequence here prevents the homepage and the demo shell from
 * drifting into different identities or retry behaviour.
 */

export const REPLAY_ENTRY_TIMEOUT_MS = 20_000;

export type ReplayEntryStage = "session" | "metadata";

export interface ReplayEntrySessionIdentity {
    meeting_id: string;
    initial_checkpoint: string;
    package_id: string;
    package_version: string;
    content_sha256: string;
}

export type ReplayEntrySession = ReplayEntrySessionIdentity;

export type ReplaySafeConfig = Record<string, unknown>;

export interface ReplayEntry {
    session: ReplayEntrySession;
    safeConfig: ReplaySafeConfig;
    checkpoint: string;
    requestId: string;
    createdAt: number;
}

export class ReplayEntryError extends Error {
    readonly stage: ReplayEntryStage;
    readonly retryable: boolean;
    readonly session: ReplayEntrySession | null;

    constructor(
        stage: ReplayEntryStage,
        message: string,
        options: {
            retryable?: boolean;
            cause?: unknown;
            session?: ReplayEntrySession | null;
        } = {}
    ) {
        super(message, { cause: options.cause });
        this.name = "ReplayEntryError";
        this.stage = stage;
        this.retryable = options.retryable ?? true;
        this.session = options.session ?? null;
    }
}

class ReplayEntryTimeoutError extends Error {
    constructor() {
        super("The demo is taking too long to load. Try again.");
        this.name = "ReplayEntryTimeoutError";
    }
}

function readString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`The demo response is missing '${key}'.`);
    }
    return value;
}

function decodeEntrySession(payload: unknown): ReplayEntrySession {
    const record = decodeObject(payload, "GET /replay/session");
    return {
        ...record,
        meeting_id: readString(record, "meeting_id"),
        initial_checkpoint: readString(record, "initial_checkpoint"),
        package_id: readString(record, "package_id"),
        package_version: readString(record, "package_version"),
        content_sha256: readString(record, "content_sha256"),
    };
}

function isNetworkFailure(error: unknown): boolean {
    if (isApiError(error)) return error.kind === "network";
    return (
        error instanceof TypeError &&
        /fetch|network|load failed/i.test(error.message)
    );
}

export function replayEntryFailureMessage(
    stage: ReplayEntryStage,
    error: Error | null | undefined
): string {
    if (error instanceof ReplayEntryError && error.stage === stage) {
        if (isNetworkFailure(error.cause) || isNetworkFailure(error)) {
            return "The demo could not reach the server. Try again.";
        }
        if (isApiError(error.cause)) {
            if (error.cause.status === 404) {
                return stage === "metadata"
                    ? "The recorded demo details are missing from this server."
                    : "The demo is not available on this server.";
            }
            if (error.cause.status === 503) {
                return stage === "metadata"
                    ? "The demo details are not configured on this server."
                    : "The demo is not configured on this server.";
            }
        }
        return error.message;
    }

    if (isNetworkFailure(error)) {
        return "The demo could not reach the server. Try again.";
    }
    if (isApiError(error)) {
        if (error.status === 404) {
            return stage === "metadata"
                ? "The recorded demo details are missing from this server."
                : "The demo is not available on this server.";
        }
        if (error.status === 503) {
            return stage === "metadata"
                ? "The demo details are not configured on this server."
                : "The demo is not configured on this server.";
        }
    }
    return (
        error?.message ??
        (stage === "metadata"
            ? "The demo details could not be loaded."
            : "The demo is unavailable.")
    );
}

export function isReplayEntryTimeout(error: unknown): boolean {
    if (error instanceof ReplayEntryError) {
        return error.cause instanceof ReplayEntryTimeoutError;
    }
    return error instanceof ReplayEntryTimeoutError;
}

function withDeadline(
    timeoutMs: number,
    parentSignal: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<ReplayEntry>
): Promise<ReplayEntry> {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort(parentSignal?.reason);

    if (parentSignal?.aborted) {
        controller.abort(parentSignal.reason);
    } else {
        parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    }

    return new Promise<ReplayEntry>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            parentSignal?.removeEventListener("abort", abortFromParent);
            callback();
        };
        const timer = setTimeout(() => {
            controller.abort(
                new DOMException("Replay entry timed out", "TimeoutError")
            );
            finish(() =>
                reject(
                    new ReplayEntryError(
                        "session",
                        "The demo is taking too long to load. Try again.",
                        {
                            cause: new ReplayEntryTimeoutError(),
                            session: null,
                        }
                    )
                )
            );
        }, timeoutMs);

        run(controller.signal).then(
            (entry) => finish(() => resolve(entry)),
            (cause) => finish(() => reject(cause))
        );
    });
}

export async function fetchReplaySession(options: {
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
} = {}): Promise<ReplayEntrySession> {
    const payload = await requestJson<unknown>("/replay/session", {
        signal: options.signal,
        retry: SESSION_REQUEST_RETRY,
        fetchImpl: options.fetchImpl,
    });
    return decodeEntrySession(payload);
}

export async function fetchReplaySafeConfig(
    session: ReplayEntrySessionIdentity,
    options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<ReplaySafeConfig> {
    const payload = await requestJson<unknown>(
        `/replay/meetings/${encodeURIComponent(
            session.meeting_id
        )}/safe-config?checkpoint=${encodeURIComponent(
            session.initial_checkpoint
        )}`,
        {
            signal: options.signal,
            fetchImpl: options.fetchImpl,
        }
    );
    const config = decodeObject(payload, "GET /replay/safe-config");
    if (
        typeof config.board !== "object" ||
        config.board === null ||
        typeof config.intake !== "object" ||
        config.intake === null
    ) {
        throw new Error("The demo details are incomplete.");
    }
    return config;
}

/**
 * Acquire everything the demo entry needs. A supplied session pins the retry
 * to metadata only; without one the session is read first.
 */
export async function loadReplayEntry(options: {
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    session?: ReplayEntrySessionIdentity | null;
} = {}): Promise<ReplayEntry> {
    return withDeadline(
        REPLAY_ENTRY_TIMEOUT_MS,
        options.signal,
        async (signal) => {
            let pinned = options.session ?? null;
            let stage: ReplayEntryStage = pinned ? "metadata" : "session";
            try {
                const session = pinned ?? (await fetchReplaySession({
                    signal,
                    fetchImpl: options.fetchImpl,
                }));
                pinned = session;
                stage = "metadata";
                const safeConfig = await fetchReplaySafeConfig(session, {
                    signal,
                    fetchImpl: options.fetchImpl,
                });
                return {
                    session,
                    safeConfig,
                    checkpoint: session.initial_checkpoint,
                    requestId: `${Date.now().toString(36)}-${Math.random()
                        .toString(36)
                        .slice(2, 10)}`,
                    createdAt: Date.now(),
                };
            } catch (cause) {
                if (signal.aborted && !(cause instanceof Error)) {
                    throw cause;
                }
                if (cause instanceof ReplayEntryError) throw cause;
                throw new ReplayEntryError(
                    stage,
                    stage === "session"
                        ? "The demo is unavailable."
                        : "The demo details could not be loaded.",
                    { cause, session: stage === "metadata" ? pinned : null }
                );
            }
        }
    );
}
