'use client';

/**
 * Settings commands (spec-05).
 *
 * Provider key tests and model discovery are explicit commands, not cached
 * reads: the request can carry a decrypted BYOK key, so TanStack Query must
 * never retain the variables or replay the call automatically.
 */
import { useMutation } from '@tanstack/react-query';

import {
    settingsClient,
    type FetchProviderModelsInput,
    type TestProviderKeyInput,
} from './client';

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
