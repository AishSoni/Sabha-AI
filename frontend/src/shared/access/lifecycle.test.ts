import { beforeEach, describe, expect, it } from 'vitest';

import {
    AccessRevokedError,
    beginAccess,
    currentAccessEpoch,
    currentAccessSignal,
    endAccess,
    getAccessSnapshot,
    isAccessActive,
    subscribeAccess,
} from './lifecycle';

describe('private access lifecycle', () => {
    beforeEach(() => {
        endAccess('signed_out');
        beginAccess();
    });

    it('mints a new epoch on every admission', () => {
        const first = currentAccessEpoch();
        beginAccess();
        expect(currentAccessEpoch()).toBe(first + 1);
        expect(isAccessActive()).toBe(true);
    });

    it('aborts the epoch signal and records the reason once', () => {
        let notifications = 0;
        const unsubscribe = subscribeAccess(() => {
            notifications += 1;
        });

        const signal = currentAccessSignal();
        expect(signal.aborted).toBe(false);
        endAccess('token_invalid');
        expect(signal.aborted).toBe(true);
        expect(getAccessSnapshot()).toMatchObject({
            active: false,
            reason: 'token_invalid',
        });

        endAccess('operator_denied');
        expect(notifications).toBe(1);
        unsubscribe();
    });

    it('gives every new epoch a fresh signal', () => {
        const first = currentAccessSignal();
        endAccess('signed_out');
        beginAccess();
        expect(currentAccessSignal()).not.toBe(first);
        expect(currentAccessSignal().aborted).toBe(false);
    });

    it('uses an abort-shaped error so callers do not retry', () => {
        expect(new AccessRevokedError().name).toBe('AbortError');
    });
});
