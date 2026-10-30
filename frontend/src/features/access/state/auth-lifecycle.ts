/**
 * Cross-tab Auth lifecycle (spec-22).
 *
 * Started only by the private operator graph. It stays subscribed while the
 * browser displays public replay so a sign-out in another tab still clears
 * retained private scope. The callback never carries a token.
 */
import {
    currentAccessEpoch,
    endAccess,
    getAccessSnapshot,
    subscribeToAuth,
} from '@/shared/access';

import { clearPrivateScope } from './private-scope';

let unsubscribe: (() => void) | null = null;
let starting = false;

export function startAuthLifecycle(): void {
    if (unsubscribe || starting) {
        return;
    }
    starting = true;
    subscribeToAuth(({ event }) => {
        if (event !== 'SIGNED_OUT') {
            return;
        }
        endAccess('signed_out');
        clearPrivateScope(getAccessSnapshot().epoch);
    })
        .then((stop) => {
            unsubscribe = stop;
            starting = false;
        })
        .catch(() => {
            starting = false;
            // The sign-in screen surfaces an unavailable Auth service; no
            // private UI is mounted from this listener.
        });
}

export function stopAuthLifecycle(): void {
    unsubscribe?.();
    unsubscribe = null;
    starting = false;
}

/** Test seam: run the same cleanup an out-of-band sign-out triggers. */
export function handleExternalSignOut(): void {
    endAccess('signed_out');
    clearPrivateScope(currentAccessEpoch());
}
