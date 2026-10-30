/**
 * Authenticated live transport (spec-22).
 *
 * Sits between feature clients and the generic JSON/byte/form helpers:
 * - only relative paths inside the configured live API base are accepted;
 * - a bearer token from the dedicated Auth adapter is attached at dispatch;
 * - caller cancellation is composed with the private lifecycle signal;
 * - the token never appears in a URL, query string or replay asset request;
 * - 401 and the exact operator-denial 403 end private admission, while a
 *   business-policy 403 and a 503 outage do not.
 *
 * No retry is performed here. Command idempotency remains in the feature
 * clients, and an uncertain paid/stateful request is never replayed.
 */
import {
    requestBytes,
    requestForm,
    requestJson,
    resolveApiBaseUrl,
    type ByteResponse,
    type BytesRequestInit,
    type JsonRequestInit,
} from '@/shared/api/transport';
import { combineSignals } from '@/shared/runtime/scope';
import { getAccessToken } from './browser-session';
import {
    AccessRevokedError,
    currentAccessEpoch,
    currentAccessSignal,
    endAccess,
    isAccessActive,
} from './lifecycle';

const LIVE_PREFIXES = [
    '/meetings',
    '/documents',
    '/knowledge_stacks',
    '/personas',
    '/settings',
    '/access',
] as const;

const OPERATOR_DENIED_DETAIL = 'Operator access denied';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class LiveTransportConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LiveTransportConfigurationError';
    }
}

type TokenSource = () => Promise<string | null>;

let tokenSource: TokenSource = getAccessToken;

/** Test/composition seam. Production leaves the SDK-backed source in place. */
export function setLiveAccessTokenSource(source: TokenSource | null): void {
    tokenSource = source ?? getAccessToken;
}

/** Validate a feature-supplied path before it reaches the URL builder. */
export function assertLivePath(path: string): void {
    if (!path.startsWith('/') || path.startsWith('//')) {
        throw new LiveTransportConfigurationError(
            'Live requests must use a relative path.'
        );
    }
    if (path.includes('\\')) {
        throw new LiveTransportConfigurationError('Live requests cannot contain backslashes.');
    }
    const pathname = path.split(/[?#]/, 1)[0];
    let decoded: string;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        throw new LiveTransportConfigurationError('Live request path is malformed.');
    }
    const segments = decoded.split('/');
    if (segments.includes('..') || decoded.includes('\\')) {
        throw new LiveTransportConfigurationError('Live request path escapes its base.');
    }
    const allowed = LIVE_PREFIXES.some(
        (prefix) => decoded === prefix || decoded.startsWith(`${prefix}/`)
    );
    if (!allowed) {
        throw new LiveTransportConfigurationError(
            'Live request path is outside the operator API.'
        );
    }
}

function baseUrl(): URL {
    const configured = resolveApiBaseUrl();
    const fallbackOrigin =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    let url: URL;
    try {
        url = new URL(configured, fallbackOrigin);
    } catch {
        throw new LiveTransportConfigurationError('Live API base URL is invalid.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new LiveTransportConfigurationError('Live API base URL must be http(s).');
    }
    if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
        throw new LiveTransportConfigurationError(
            'Live API must use https outside localhost.'
        );
    }
    return url;
}

function liveUrl(path: string): string {
    assertLivePath(path);
    const base = baseUrl();
    return `${base.origin}${base.pathname.replace(/\/$/, '')}${path}`;
}

function assertTrustedRequestUrl(input: RequestInfo | URL): void {
    const raw =
        typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
    const base = baseUrl();
    let target: URL;
    try {
        target = new URL(raw, base);
    } catch {
        throw new LiveTransportConfigurationError('Live request URL is invalid.');
    }
    if (target.origin !== base.origin) {
        throw new LiveTransportConfigurationError('Live token cannot cross origins.');
    }
    const basePath = base.pathname.replace(/\/$/, '');
    if (target.pathname !== basePath && !target.pathname.startsWith(`${basePath}/`)) {
        throw new LiveTransportConfigurationError(
            'Live token cannot leave the configured API base path.'
        );
    }
    const relative = target.pathname.slice(basePath.length) || '/';
    assertLivePath(relative);
}

async function isOperatorDenied(response: Response): Promise<boolean> {
    if (typeof response.clone !== 'function') {
        return false;
    }
    try {
        const body = (await response.clone().json()) as { detail?: unknown };
        return body?.detail === OPERATOR_DENIED_DETAIL;
    } catch {
        return false;
    }
}

async function liveFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    assertTrustedRequestUrl(input);
    if (!isAccessActive()) {
        throw new AccessRevokedError();
    }

    const epoch = currentAccessEpoch();
    const token = await tokenSource();
    if (!isAccessActive() || currentAccessEpoch() !== epoch) {
        throw new AccessRevokedError();
    }
    if (!token) {
        endAccess('token_invalid');
        throw new AccessRevokedError();
    }

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const signal = combineSignals(currentAccessSignal(), init.signal ?? undefined);

    let response: Response;
    try {
        response = await fetch(input, {
            ...init,
            headers,
            signal,
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
        });
    } catch (error) {
        if (!isAccessActive() || currentAccessEpoch() !== epoch) {
            throw new AccessRevokedError();
        }
        throw error;
    }

    if (!isAccessActive() || currentAccessEpoch() !== epoch) {
        throw new AccessRevokedError();
    }
    if (response.status === 401) {
        endAccess('token_invalid');
        return response;
    }
    if (response.status === 403 && (await isOperatorDenied(response))) {
        endAccess('operator_denied');
    }
    return response;
}

export function requestLiveJson<T>(
    path: string,
    init: Omit<JsonRequestInit, 'fetchImpl'> = {}
): Promise<T> {
    liveUrl(path);
    return requestJson<T>(path, { ...init, fetchImpl: liveFetch });
}

export function requestLiveBytes(
    path: string,
    init: Omit<BytesRequestInit, 'fetchImpl'> = {}
): Promise<ByteResponse> {
    liveUrl(path);
    return requestBytes(path, { ...init, fetchImpl: liveFetch });
}

export function requestLiveForm<T>(
    path: string,
    form: FormData,
    init: { signal?: AbortSignal; headers?: Record<string, string> } = {}
): Promise<T> {
    liveUrl(path);
    return requestForm<T>(path, form, { ...init, fetchImpl: liveFetch });
}

/** Open an authenticated SSE response; every reconnect calls this again. */
export function fetchLiveStream(
    path: string,
    init: { signal?: AbortSignal; headers?: Record<string, string> } = {}
): Promise<Response> {
    return liveFetch(liveUrl(path), {
        method: 'GET',
        headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            ...(init.headers ?? {}),
        },
        signal: init.signal,
    });
}
