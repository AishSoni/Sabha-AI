/**
 * Scripted fetch/SSE transport fakes for frontend tests (spec-03).
 *
 * A deterministic `fetch` replacement: tests queue JSON outcomes (or one
 * rejection) in order, every call is recorded for assertions, and install()
 * wires the current queue into `globalThis.fetch`. SSE streams use the raw
 * wire envelopes from ./sse (makeSseResponse) instead — this fake covers the
 * JSON endpoints without queueing real sockets.
 */
import { vi } from "vitest";

export interface ScriptedFetchCall {
    input: string;
    init?: RequestInit;
}

interface QueuedJson {
    status: number;
    body: unknown;
}

interface QueuedFailure {
    error: Error;
}

interface QueuedPending {
    promise: Promise<Response>;
}

export interface PendingJsonHandle {
    resolve(): void;
    reject(error: Error): void;
}

export interface ScriptedFetch {
    /** Every observed fetch call, in order. */
    calls: ScriptedFetchCall[];
    /** Queue a response that satisfies `res.json()` for the next call. */
    enqueueJson(status: number, body: unknown): void;
    /** Make the next call reject (connection refused, abort, ...). */
    enqueueFailure(error: Error): void;
    /** Hold the next call's response until the returned handle settles. */
    enqueuePendingJson(status: number, body: unknown): PendingJsonHandle;
    /** Wire the handler into globalThis.fetch (via vi.stubGlobal). */
    install(): void;
    /** Remove the stub and recorded calls so suites stay independent. */
    reset(): void;
}

export function createScriptedFetch(): ScriptedFetch {
    const calls: ScriptedFetchCall[] = [];
    const queue: (QueuedJson | QueuedFailure | QueuedPending)[] = [];

    const handler = async (input: unknown, init?: RequestInit): Promise<Response> => {
        calls.push({ input: typeof input === "string" ? input : String(input), init });
        const next = queue.shift();
        if (!next) {
            throw new Error(
                "ScriptedFetch: no queued outcome for fetch call — tests must enqueueJson/enqueueFailure first."
            );
        }
        if ("error" in next) {
            throw next.error;
        }
        if ("promise" in next) {
            return await next.promise;
        }
        return scriptJsonResponse(next.status, next.body);
    };

    function scriptJsonResponse(status: number, body: unknown): Response {
        return {
            ok: status < 400,
            status,
            json: async () => body,
        } as unknown as Response;
    }

    return {
        calls,
        enqueueJson(status: number, body: unknown): void {
            queue.push({ status, body });
        },
        enqueueFailure(error: Error): void {
            queue.push({ error });
        },
        /**
         * Hold the next call's response until the returned handle settles.
         * Lets a test resolve an in-flight response out of order (for
         * example, prove a late stale snapshot cannot regress a newer
         * cache entry).
         */
        enqueuePendingJson(status: number, body: unknown): PendingJsonHandle {
            let resolveResponse!: (response: Response) => void;
            const promise = new Promise<Response>((resolve) => {
                resolveResponse = resolve;
            });
            queue.push({ promise });
            return {
                resolve(): void {
                    resolveResponse(scriptJsonResponse(status, body));
                },
                reject(error: Error): void {
                    const rejection = Promise.reject(error) as unknown as Response;
                    resolveResponse(rejection);
                },
            };
        },
        install(): void {
            vi.stubGlobal("fetch", handler);
        },
        reset(): void {
            queue.length = 0;
            calls.length = 0;
            vi.unstubAllGlobals();
        },
    };
}
