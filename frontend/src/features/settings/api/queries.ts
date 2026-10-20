'use client';

/**
 * Query owner for settings metadata (spec-05).
 *
 * The provider environment is server state: TanStack Query owns the read
 * while the local store keeps user preferences only. Every hydration fetches
 * fresh metadata — nothing gates or suppresses the refresh.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { settingsKeys } from './keys';
import { settingsClient } from './client';
import type { ProvidersEnvironment } from './decoders';

export { settingsKeys };

export function useProvidersEnvironment(): UseQueryResult<ProvidersEnvironment, Error> {
    return useQuery<ProvidersEnvironment, Error>({
        queryKey: settingsKeys.providers(),
        queryFn: ({ signal }) => settingsClient.getProviders({ signal }),
    });
}
