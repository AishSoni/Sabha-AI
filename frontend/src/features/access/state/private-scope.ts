/**
 * Private browser scope cleanup (spec-22).
 *
 * Logout/session loss clears only live records. Replay query keys are
 * prefixed with "replay" and the replay graph never imports this module, so
 * recorded progress cannot be reset by a live sign-out.
 */
import type { QueryClient } from '@tanstack/react-query';

import { clearLiveTurnProjections } from '@/features/meetings';
import { useSettingsStore } from '@/features/settings';

let queryClient: QueryClient | null = null;
let clearedEpoch = -1;

export function registerPrivateScope(client: QueryClient): void {
    queryClient = client;
}

export function clearPrivateScope(epoch: number): void {
    if (clearedEpoch === epoch) {
        return;
    }
    clearedEpoch = epoch;

    if (queryClient) {
        queryClient.removeQueries({
            predicate: (query) => query.queryKey[0] !== 'replay',
        });
        queryClient.getMutationCache().clear();
    }
    clearLiveTurnProjections();
    // Provider credentials disappear from memory; encrypted envelopes stay
    // until the operator explicitly forgets them.
    useSettingsStore.getState().lockVault();
}
