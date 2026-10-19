/**
 * Shared HTTP transport for the Sabha frontend (spec-05).
 *
 * Owns the no-sign-in request contract: request composition against the
 * configured API base, JSON and multipart decoding, structured failures,
 * and deliberate AbortSignal propagation. Knows nothing about features,
 * query keys, or stores — feature-local clients compose on top of it.
 *
 * Credentials are intentionally never configured and no auth headers are
 * ever attached: the workspace has no sign-in, and cross-origin requests
 * must not ride on ambient cookies.
 */
import {
    ApiError,
    httpApiError,
    readFailureDetail,
    transportApiError,
} from "./errors";

const DEFAULT_API_BASE = "http://localhost:8000/api";

export { ApiError, isApiError } from "./errors";

/**
 * Resolves the API base at call time so deployed ("hosted") and local
 * runs differ only through NEXT_PUBLIC_API_URL.
 */
export function resolveApiBaseUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;
}

export type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface JsonRequestInit {
    method?: RequestMethod;
    /** JSON-serializable request body. */
    body?: unknown;
    /** Propagated to fetch; aborting surfaces as ApiError kind "aborted". */
    signal?: AbortSignal;
    /** Query parameters; undefined entries are skipped, booleans use "true"/"false". */
    query?: Record<string, string | number | boolean | undefined>;
}

/** Absolute URLs pass through; other paths are resolved against the base. */
function apiUrl(path: string, query?: JsonRequestInit["query"]): string {
    const base = resolveApiBaseUrl();
    const joined = /^https?:\/\//i.test(path)
        ? path
        : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    if (!query) {
        return joined;
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
            params.append(key, String(value));
        }
    }
    const encoded = params.toString();
    return encoded ? `${joined}?${encoded}` : joined;
}

async function decodeSuccessPayload<T>(response: Response, path: string): Promise<T> {
    try {
        return (await response.json()) as T;
    } catch (cause) {
        throw new ApiError(
            "http",
            response.status,
            "Unexpected response from the server",
            { cause }
        );
    }
}

/** Performs a JSON request and decodes the successful payload. */
export async function requestJson<T>(path: string, init: JsonRequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
        response = await fetch(apiUrl(path, init.query), {
            method: init.method ?? "GET",
            headers,
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            signal: init.signal,
        });
    } catch (cause) {
        throw transportApiError(cause);
    }

    if (!response.ok) {
        throw httpApiError(response.status, await readFailureDetail(response));
    }
    return decodeSuccessPayload<T>(response, path);
}

/**
 * Performs a multipart upload. The Content-Type header is deliberately
 * omitted so the browser sets the multipart boundary.
 */
export async function requestForm<T>(
    path: string,
    form: FormData,
    init: { signal?: AbortSignal } = {}
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(apiUrl(path), {
            method: "POST",
            body: form,
            signal: init.signal,
        });
    } catch (cause) {
        throw transportApiError(cause);
    }

    if (!response.ok) {
        throw httpApiError(response.status, await readFailureDetail(response));
    }
    return decodeSuccessPayload<T>(response, path);
}

/** Reads the structured failure from an unknown thrown value. */
export function asApiError(value: unknown): ApiError {
    if (value instanceof ApiError) {
        return value;
    }
    return transportApiError(value);
}
