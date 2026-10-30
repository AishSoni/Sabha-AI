"use client";

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';

import {
    beginAccess,
    endAccess,
    getAccessSnapshot,
    hasLocalSession,
    isAuthConfigured,
    signOutEverywhere,
    subscribeAccess,
} from '@/shared/access';

import { probeOperatorSession } from '../api/session';
import { startAuthLifecycle } from '../state/auth-lifecycle';
import { clearPrivateScope, registerPrivateScope } from '../state/private-scope';
import { loginHref, safeReturnTarget } from '../state/return-target';
import { AccessStatusScreen, type AccessState } from './access-status-screen';
import { OperatorShell } from './operator-shell';

/**
 * Private route-group boundary. Children mount only after the backend probe
 * admits the configured operator; a locally restored SDK session alone is
 * never readiness.
 */
export function OperatorAccessProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const [state, setState] = useState<AccessState>(() =>
        isAuthConfigured() ? 'checking' : 'unconfigured'
    );
    const attempt = useRef(0);
    const snapshot = useSyncExternalStore(
        subscribeAccess,
        getAccessSnapshot,
        getAccessSnapshot
    );

    useEffect(() => {
        registerPrivateScope(queryClient);
        startAuthLifecycle();
    }, [queryClient]);

    const admit = useCallback(async () => {
        const current = ++attempt.current;

        if (!isAuthConfigured()) {
            return;
        }

        let localSession: boolean;
        try {
            localSession = await hasLocalSession();
        } catch {
            if (current === attempt.current) {
                setState('unavailable');
            }
            return;
        }
        if (current !== attempt.current) {
            return;
        }
        if (!localSession) {
            setState('signed-out');
            return;
        }

        beginAccess();
        const probe = await probeOperatorSession();
        if (current !== attempt.current) {
            return;
        }
        if (probe.status === 'ready') {
            setState('ready');
        } else if (probe.status === 'forbidden') {
            setState('forbidden');
        } else if (probe.status === 'signed-out') {
            setState('signed-out');
        } else {
            setState('unavailable');
        }
    }, []);

    useEffect(() => {
        // Async admission reads external Auth state; state updates happen
        // after the awaited probe, not synchronously in this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void admit();
        return () => {
            // Navigation inside the app (including into public replay) must
            // not end admission. Only unmount invalidation is guarded here.
            attempt.current += 1;
        };
    }, [admit]);

    useEffect(() => {
        if (snapshot.active || !snapshot.reason) {
            return;
        }
        clearPrivateScope(snapshot.epoch);
    }, [snapshot]);

    const effectiveState: AccessState =
        !snapshot.active && state === 'ready'
            ? snapshot.reason === 'operator_denied'
                ? 'forbidden'
                : 'signed-out'
            : state;

    useEffect(() => {
        if (effectiveState === 'signed-out') {
            router.replace(loginHref(safeReturnTarget(pathname)));
        }
    }, [effectiveState, pathname, router]);

    const logout = useCallback(() => {
        attempt.current += 1;
        endAccess('signed_out');
        clearPrivateScope(getAccessSnapshot().epoch);
        setState('signed-out');
        void signOutEverywhere().catch(() => {
            // The in-memory scope and local session are already gone.
        });
    }, []);

    const retry = useCallback(() => {
        setState('checking');
        void admit();
    }, [admit]);

    if (effectiveState === 'ready') {
        return <OperatorShell onLogout={logout}>{children}</OperatorShell>;
    }

    return (
        <AccessStatusScreen
            state={effectiveState}
            onRetry={retry}
            onSignOut={logout}
        />
    );
}
