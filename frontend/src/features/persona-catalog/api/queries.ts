'use client';

/**
 * Read hooks for the persona catalog (spec-05). The list query is the
 * canonical owner of the roster source data; screens keep only their local
 * selection state.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PersonaListResponse } from './decoders';
import { personaClient } from './client';
import { personaKeys } from './keys';

export function usePersonaList(): UseQueryResult<PersonaListResponse, Error> {
    return useQuery({
        queryKey: personaKeys.list(),
        queryFn: ({ signal }) => personaClient.list({ signal }),
    });
}
