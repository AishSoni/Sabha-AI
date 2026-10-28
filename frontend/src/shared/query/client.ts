import { QueryClient } from "@tanstack/react-query";

const QUERY_STALE_TIME_MS = 30_000;

/**
 * One query-client shape for every runtime scope (spec-14).
 *
 * Live browsing and a recorded replay must not share mutable cache state, so
 * callers mint a client per runtime epoch through this factory. The defaults
 * stay deliberate: reads may retry, paid/stateful commands never do.
 */
export function makeQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: QUERY_STALE_TIME_MS,
            },
            mutations: {
                retry: false,
            },
        },
    });
}
