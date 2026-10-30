import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscribeToAuth = vi.hoisted(() => vi.fn());
const clearPrivateScope = vi.hoisted(() => vi.fn());
const endAccess = vi.hoisted(() => vi.fn());
const getAccessSnapshot = vi.hoisted(() => vi.fn(() => ({ epoch: 7, active: false })));
const currentAccessEpoch = vi.hoisted(() => vi.fn(() => 7));

vi.mock('@/shared/access', () => ({
    subscribeToAuth,
    endAccess,
    getAccessSnapshot,
    currentAccessEpoch,
}));
vi.mock('./private-scope', () => ({ clearPrivateScope }));

import { handleExternalSignOut, startAuthLifecycle, stopAuthLifecycle } from './auth-lifecycle';

describe('cross-tab auth lifecycle', () => {
    beforeEach(() => {
        stopAuthLifecycle();
        subscribeToAuth.mockReset();
        clearPrivateScope.mockReset();
        endAccess.mockReset();
        getAccessSnapshot.mockReset().mockReturnValue({ epoch: 7, active: false });
        currentAccessEpoch.mockReset().mockReturnValue(7);
    });

    it('ends admission and clears private scope on an SDK sign-out', async () => {
        let notify: (change: { event: string; hasSession: boolean }) => void = () => {};
        subscribeToAuth.mockImplementation(async (listener) => {
            notify = listener;
            return () => {};
        });

        startAuthLifecycle();
        await Promise.resolve();
        notify({ event: 'SIGNED_OUT', hasSession: false });

        expect(endAccess).toHaveBeenCalledWith('signed_out');
        expect(clearPrivateScope).toHaveBeenCalledWith(7);
    });

    it('ignores token refreshes and delivers the same cleanup out of band', async () => {
        let notify: (change: { event: string; hasSession: boolean }) => void = () => {};
        subscribeToAuth.mockImplementation(async (listener) => {
            notify = listener;
            return () => {};
        });

        startAuthLifecycle();
        await Promise.resolve();
        notify({ event: 'TOKEN_REFRESHED', hasSession: true });
        expect(endAccess).not.toHaveBeenCalled();

        handleExternalSignOut();
        expect(endAccess).toHaveBeenCalledWith('signed_out');
        expect(clearPrivateScope).toHaveBeenCalled();
    });
});
