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
    /** Extra request headers (for example the per-turn BYOK header). */
    headers?: Record<string, string>;
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

export interface BytesRequestInit {
    method?: RequestMethod;
    /** Extra request headers (for example an evidence Accept type). */
    headers?: Record<string, string>;
    /** Propagated to fetch; aborting surfaces as ApiError kind "aborted". */
    signal?: AbortSignal;
    /** Query parameters; undefined entries are skipped. */
    query?: JsonRequestInit["query"];
}

export interface ByteResponse {
    bytes: Uint8Array;
    contentType: string | null;
    contentLength: number | null;
    fileName: string | null;
}

function fileNameFromDisposition(value: string | null): string | null {
    if (!value) {
        return null;
    }
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value);
    if (encoded?.[1]) {
        const candidate = encoded[1].trim().replace(/^"|"$/g, "");
        try {
            return decodeURIComponent(candidate);
        } catch {
            return candidate;
        }
    }
    const plain = /filename="?([^";]+)"?/i.exec(value);
    return plain?.[1]?.trim() ?? null;
}

/**
 * Performs a binary/text request and returns the raw bytes plus response
 * metadata. Used by the evidence viewer so private revision bytes never pass
 * through a JSON encoder or a signed/public URL.
 */
export async function requestBytes(
    path: string,
    init: BytesRequestInit = {}
): Promise<ByteResponse> {
    let response: Response;
    try {
        response = await fetch(apiUrl(path, init.query), {
            method: init.method ?? "GET",
            headers: init.headers,
            signal: init.signal,
        });
    } catch (cause) {
        throw transportApiError(cause);
    }

    if (!response.ok) {
        throw httpApiError(response.status, await readFailureDetail(response));
    }

    let buffer: ArrayBuffer;
    try {
        buffer = await response.arrayBuffer();
    } catch (cause) {
        throw transportApiError(cause);
    }

    const rawLength = response.headers?.get("content-length") ?? null;
    const parsedLength = rawLength === null ? null : Number.parseInt(rawLength, 10);
    return {
        bytes: new Uint8Array(buffer),
        contentType: response.headers?.get("content-type") ?? null,
        contentLength:
            parsedLength !== null && Number.isFinite(parsedLength) ? parsedLength : null,
        fileName: fileNameFromDisposition(response.headers?.get("content-disposition") ?? null),
    };
}

/** Performs a JSON request and decodes the successful payload. */
export async function requestJson<T>(path: string, init: JsonRequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
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
