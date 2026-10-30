import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeQueryClient } from '@/shared/query/client';
import {
    turnProjectionKey,
    useTurnProjectionStore,
} from '@/features/meetings';
import { useSettingsStore } from '@/features/settings';

import { clearPrivateScope, registerPrivateScope } from './private-scope';

function seedProjection(meetingId: string, scopeId: string) {
    useTurnProjectionStore.getState().ensure(
        { meetingId, operationId: 'operation-1', scopeId },
        'queued'
    );
}

describe('private scope cleanup', () => {
    beforeEach(() => {
        useTurnProjectionStore.setState({ projections: {} });
    });

    it('clears live records, private projections and locks the vault', () => {
        const client = makeQueryClient();
        registerPrivateScope(client);
        client.setQueryData(['meetings'], [{ id: 'live-meeting' }]);
        client.setQueryData(['replay', 'scope', 1, 'meetings'], [
            { id: 'replay-meeting' },
        ]);
        client.getMutationCache().build(client, {
            mutationFn: async () => ({ ok: true }),
        });
        seedProjection('live-meeting', 'live');
        seedProjection('replay-meeting', '["replay","scope",1]');

        const lockVault = vi.spyOn(
            useSettingsStore.getState(),
            'lockVault'
        );

        clearPrivateScope(9001);

        expect(client.getQueryData(['meetings'])).toBeUndefined();
        expect(client.getQueryData(['replay', 'scope', 1, 'meetings'])).toEqual([
            { id: 'replay-meeting' },
        ]);
        expect(client.getMutationCache().getAll()).toHaveLength(0);
        expect(
            useTurnProjectionStore.getState().projections[
                turnProjectionKey({
                    meetingId: 'live-meeting',
                    operationId: 'operation-1',
                    scopeId: 'live',
                })
            ]
        ).toBeUndefined();
        expect(
            useTurnProjectionStore.getState().projections[
                turnProjectionKey({
                    meetingId: 'replay-meeting',
                    operationId: 'operation-1',
                    scopeId: '["replay","scope",1]',
                })
            ]
        ).toBeDefined();
        expect(lockVault).toHaveBeenCalled();
    });

    it('runs at most once per ended epoch', () => {
        const client = makeQueryClient();
        registerPrivateScope(client);
        client.setQueryData(['meetings'], []);
        const removeQueries = vi.spyOn(client, 'removeQueries');

        clearPrivateScope(9002);
        clearPrivateScope(9002);

        expect(removeQueries).toHaveBeenCalledTimes(1);
    });
});
