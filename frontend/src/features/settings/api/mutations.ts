'use client';

/**
 * Settings commands (spec-05).
 *
 * Provider key tests and model discovery are explicit commands, not cached
 * reads: the request can carry a decrypted BYOK key, so TanStack Query must
 * never retain the variables or replay the call automatically.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
    settingsClient,
    type FetchProviderModelsInput,
    type TestProviderKeyInput,
    type UpdateSystemAIInput,
} from './client';
import { settingsKeys } from './keys';

export function useFetchProviderModels() {
    return useMutation({
        mutationFn: (input: FetchProviderModelsInput) => settingsClient.fetchModels(input),
    });
}

export function useTestProviderKey() {
    return useMutation({
        mutationFn: (input: TestProviderKeyInput) => settingsClient.testKey(input),
    });
}

export function useUpdateSystemAI() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: UpdateSystemAIInput) => settingsClient.updateSystemAI(input),
        onSuccess: () => {
            // The GET /providers snapshot embeds system_ai; invalidating it
            // makes every consumer observe the committed server revision.
            void queryClient.invalidateQueries({ queryKey: settingsKeys.providers() });
        },
    });
}
