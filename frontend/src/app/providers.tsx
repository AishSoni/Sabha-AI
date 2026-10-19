'use client';

/**
 * App query composition (spec-05).
 *
 * TanStack Query is the single owner of canonical backend records for
 * migrated features. The client is minted through `getQueryClient`:
 *
 * - on the server, every call returns a fresh instance so an RSC request
 *   never shares a mutable cache with another request;
 * - in the browser, one module-level instance is reused for the whole
 *   session (no per-render cache resets).
 *
 * The deliberate defaults:
 * - mutations never auto-retry: turn generation, uploads, and meeting
 *   lifecycle commands are paid or stateful operations, so the UI retries
 *   explicitly through user action instead of an automatic replay;
 * - queries keep the library retry defaults (reads are cheap and absent
 *   of side effects) with a stale time short enough that canonical lists
 *   stay near their source while avoiding render-storm refetches on
 *   remounts inside the same session.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

const QUERY_STALE_TIME_MS = 30_000;

export function makeQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: QUERY_STALE_TIME_MS,
            },
            mutations: {
                // Deliberate: failed mutations surface to the caller and are
                // retried by user intent only — never replayed automatically.
                retry: false,
            },
        },
    });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
    if (typeof window === 'undefined') {
        // Server request path: a fresh client per request, never shared.
        return makeQueryClient();
    }
    if (!browserQueryClient) {
        browserQueryClient = makeQueryClient();
    }
    return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => getQueryClient());

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
