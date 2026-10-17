// In-memory transport double for the shared HTTP client.
//
// Tests exercise the real client (base URL, actor attribution, error
// normalization) and only swap the axios adapter, so no network or jsdom XHR
// is involved. SSE subscriptions stay on `fetch` and mock that directly.

import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { httpClient } from '@/lib/http';

export interface MockResponse {
    /** Route match: exact path (query string included) or a pattern. */
    url: string | RegExp;
    method?: 'get' | 'post' | 'put' | 'patch' | 'delete';
    status?: number;
    data?: unknown;
}

export type MockHandler = (config: InternalAxiosRequestConfig) => MockResponse | undefined;

function matches(config: InternalAxiosRequestConfig, route: MockResponse): boolean {
    const method = (config.method ?? 'get').toLowerCase();
    if (route.method && route.method !== method) return false;
    const url = config.url ?? '';
    // axios params are serialized by test assertions only through the URL.
    const full = url.startsWith('http') ? url : `${config.baseURL ?? ''}${url}`;
    return typeof route.url === 'string' ? full === route.url : route.url.test(full);
}

const installed: Array<() => void> = [];

/**
 * Install a fake adapter for the duration of a test.
 *
 * Returns the recorded requests (URL, method, headers, body) so tests can
 * assert attribution and payloads the same way the old fetch stubs did.
 * Non-2xx routes reject with a real `AxiosError`, exercising the client's
 * error interceptor end to end. Call `restoreHttpMocks()` in `afterEach`.
 */
export function mockHttp(routes: MockResponse | MockResponse[] | MockHandler) {
    const calls: InternalAxiosRequestConfig[] = [];
    const resolve = (config: InternalAxiosRequestConfig): MockResponse | undefined => {
        if (typeof routes === 'function') return routes(config);
        if (Array.isArray(routes)) return routes.find((r) => matches(config, r));
        return matches(config, routes) ? routes : undefined;
    };
    const adapter: AxiosAdapter = async (config) => {
        calls.push(config);
        const route = resolve(config);
        if (!route) {
            throw new Error(`unexpected request ${config.method?.toUpperCase()} ${config.url}`);
        }
        const status = route.status ?? 200;
        const response: AxiosResponse = {
            data: route.data ?? {},
            status,
            statusText: 'Mock',
            headers: {},
            config,
        };
        if (status >= 400) {
            throw new AxiosError(`Request failed with status code ${status}`, String(status), config, {}, response);
        }
        return response;
    };

    const previous = httpClient.defaults.adapter;
    httpClient.defaults.adapter = adapter;
    const restore = () => {
        httpClient.defaults.adapter = previous;
    };
    installed.push(restore);
    /** Bodies reach the adapter already serialized; parse them back for assertions. */
    const body = (config: InternalAxiosRequestConfig): unknown => {
        const raw = config.data;
        if (typeof raw !== 'string') return raw;
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    };
    return {
        calls,
        bodyOf: (config: InternalAxiosRequestConfig) => body(config),
        lastCall: () => calls[calls.length - 1],
        lastBody: () => body(calls[calls.length - 1]),
        restore,
    };
}

/** Undo every `mockHttp` installed in this test file. */
export function restoreHttpMocks(): void {
    while (installed.length > 0) installed.pop()?.();
}