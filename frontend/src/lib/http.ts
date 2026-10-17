/**
 * Shared HTTP client: the single transport boundary for the whole frontend.
 *
 * Every backend call goes through `http` (axios) or `streamRequest` (SSE), so
 * the API base URL, trusted-actor attribution, and error normalization live in
 * exactly one place. Feature modules (lib/api, lib/demoGuideApi) must not call
 * `fetch` directly.
 */

import axios, {
    AxiosHeaders,
    type AxiosInstance,
    type AxiosRequestConfig,
    type AxiosResponse,
    type InternalAxiosRequestConfig,
} from 'axios';

/** Backend API root. Single source of truth for every request. */
export const API_BASE = (
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
).replace(/\/$/, '');

/** Typed server error: preserves status/conflict codes across the UI. */
export class ApiError extends Error {
    status: number;
    code: string;
    retryable: boolean;

    constructor(status: number, code: string, message: string, retryable = false) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.retryable = retryable;
    }
}

/**
 * Normalize any backend error body into an `ApiError`.
 *
 * Two error dialects are served today: the REST routes answer
 * `{detail: "revision_conflict"}`, the demo v2 routes answer
 * `{code, message, retryable}`. An explicit server `code` always wins so
 * callers can branch on it; otherwise the status maps to a stable code.
 */
export function toApiError(status: number, body: unknown): ApiError {
    const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    const detail =
        (typeof raw.detail === 'string' && raw.detail) ||
        (typeof raw.message === 'string' && raw.message) ||
        '';
    const message = detail || `API Error: ${status}`;
    const serverCode = typeof raw.code === 'string' && raw.code ? raw.code : '';
    const retryable = typeof raw.retryable === 'boolean' ? raw.retryable : undefined;

    const byStatus = (): ApiError => {
        if (status === 401) return new ApiError(status, 'unauthenticated', message, false);
        if (status === 404) return new ApiError(status, 'not_found', message, false);
        if (status === 409) return new ApiError(status, detail || 'conflict', message, false);
        if (status === 422) return new ApiError(status, 'validation', message, false);
        if (status === 429) return new ApiError(status, 'quota', message, true);
        if (status === 503) return new ApiError(status, 'unavailable', message, true);
        // Status 0 means the request never produced a response (offline, DNS,
        // connection reset): retryable transport failure, not a server verdict.
        if (status === 0) return new ApiError(status, 'unavailable', message, true);
        return new ApiError(status, 'request_failed', message, status >= 500);
    };

    const normalized = byStatus();
    if (serverCode) normalized.code = serverCode;
    if (retryable !== undefined) normalized.retryable = retryable;
    return normalized;
}

export function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Trusted-actor attribution (CONTRACTS section 1: identity comes from the
 * transport, never the body).
 *
 * - Demo sessions attribute to the fixed demo owner so the shared ownership
 *   check passes for demo-created meetings (bookkeeping identity, not auth).
 * - Normal use carries a stable anonymous local identity. This is NOT
 *   authentication: it only gives normal meetings an owner for their own
 *   reads/writes (B-05 is withdrawn; no accounts are ever created).
 */
export const DEMO_ACTOR_ID = 'demo-visitor';
const LOCAL_ACTOR_ID = 'local-dev';

export function authHeaders(): Record<string, string> {
    let identity = LOCAL_ACTOR_ID;
    try {
        const token = sessionStorage.getItem('sabha.demo.sessionToken');
        const demoMeeting = sessionStorage.getItem('sabha.demo.meetingId');
        // Demo actor carries THREE signals: pinned meeting id, the legacy
        // identifer token ('real-...' before recorded meeting pinning), and
        // any stored raw credential (session exists). All resolve to the
        // fixed demo owner sharing real ownership bookkeeping.
        if (demoMeeting || (token && token.startsWith('real-')) || token) identity = DEMO_ACTOR_ID;
    } catch {
        /* storage unavailable -> local identity */
    }
    return { Authorization: `Bearer ${identity}` };
}

/** Absolute URL for a client-relative path. */
export function resolveUrl(path: string): string {
    return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

declare module 'axios' {
    interface AxiosRequestConfig {
        /** Auth-free route (published content): send no Authorization header. */
        skipAuth?: boolean;
    }
}

/** Per-request options layered on the axios config. */
export type HttpRequestConfig = AxiosRequestConfig;

export const httpClient: AxiosInstance = axios.create({
    baseURL: API_BASE,
    headers: { Accept: 'application/json' },
});

// Attribution is transport-owned: attach it unless the caller supplied its own
// credential (demo routes pass the raw session token) or opted out.
httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const headers = AxiosHeaders.from(config.headers);
    if (!config.skipAuth && !headers.has('Authorization')) {
        headers.set('Authorization', authHeaders().Authorization);
    }
    config.headers = headers;
    return config;
});

httpClient.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
        // Cancellations are control flow, not failures: keep the platform
        // AbortError shape callers already branch on.
        if (axios.isCancel(error)) throw new DOMException('Aborted', 'AbortError');
        if (axios.isAxiosError(error)) {
            const status = error.response?.status ?? 0;
            throw toApiError(status, error.response?.data);
        }
        throw error;
    },
);

/**
 * Data-returning verbs. Failures always surface as `ApiError`, so feature
 * modules never branch on transport status codes.
 */
export const http = {
    async get<T>(path: string, config?: HttpRequestConfig): Promise<T> {
        return (await httpClient.get<T>(path, config)).data;
    },

    async post<T>(path: string, body?: unknown, config?: HttpRequestConfig): Promise<T> {
        return (await httpClient.post<T>(path, body, config)).data;
    },

    async put<T>(path: string, body?: unknown, config?: HttpRequestConfig): Promise<T> {
        return (await httpClient.put<T>(path, body, config)).data;
    },

    async patch<T>(path: string, body?: unknown, config?: HttpRequestConfig): Promise<T> {
        return (await httpClient.patch<T>(path, body, config)).data;
    },

    async delete<T>(path: string, config?: HttpRequestConfig): Promise<T> {
        return (await httpClient.delete<T>(path, config)).data;
    },

    /** Full response for the rare callers that must branch on the status code. */
    async raw<T>(path: string, body?: unknown, config?: HttpRequestConfig): Promise<AxiosResponse<T>> {
        return httpClient.post<T>(path, body, config);
    },
};

export interface StreamRequestInit {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    /** Overrides the actor header (demo credentials) or omits it entirely. */
    headers?: Record<string, string>;
    skipAuth?: boolean;
}

/**
 * Streaming request (SSE) for turn and ending journals.
 *
 * Browser XHR — and therefore axios — cannot deliver incremental body chunks,
 * so subscriptions read `response.body` directly. They still route through
 * this module: base URL, actor attribution, and error normalization stay here.
 * Throws `ApiError` for non-2xx, exactly like `http`.
 */
export async function streamRequest(path: string, init: StreamRequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init.skipAuth ? {} : authHeaders()),
        ...init.headers,
    };
    const response = await fetch(resolveUrl(path), {
        method: init.method ?? 'GET',
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: init.signal,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw toApiError(response.status, error);
    }
    return response;
}