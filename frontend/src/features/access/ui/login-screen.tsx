"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
    AccessConfigurationError,
    AccessSignInError,
    AuthServiceUnavailable,
    beginAccess,
    endAccess,
    hasLocalSession,
    isAuthConfigured,
    signInWithPassword,
    signOutEverywhere,
} from '@/shared/access';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { probeOperatorSession } from '../api/session';
import { safeReturnTarget } from '../state/return-target';

type LoginMode =
    | 'checking'
    | 'idle'
    | 'submitting'
    | 'unavailable'
    | 'forbidden'
    | 'unconfigured';

export function LoginScreen() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const target = safeReturnTarget(searchParams.get('next'));
    const [mode, setMode] = useState<LoginMode>(() =>
        isAuthConfigured() ? 'checking' : 'unconfigured'
    );
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const attempt = useRef(0);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            attempt.current += 1;
        };
    }, []);

    const restore = useCallback(async () => {
        const current = ++attempt.current;

        if (!isAuthConfigured()) {
            return;
        }

        let localSession: boolean;
        try {
            localSession = await hasLocalSession();
        } catch {
            if (current === attempt.current && mounted.current) {
                setMode('unavailable');
            }
            return;
        }
        if (current !== attempt.current || !mounted.current) {
            return;
        }
        if (!localSession) {
            setMode('idle');
            return;
        }

        beginAccess();
        const probe = await probeOperatorSession();
        if (current !== attempt.current || !mounted.current) {
            return;
        }

        if (probe.status === 'ready') {
            router.replace(target);
            return;
        }
        if (probe.status === 'forbidden') {
            endAccess('operator_denied');
            await signOutEverywhere().catch(() => {});
            if (current === attempt.current && mounted.current) {
                setMode('forbidden');
            }
            return;
        }
        if (probe.status === 'signed-out') {
            endAccess('token_invalid');
            await signOutEverywhere().catch(() => {});
            if (current === attempt.current && mounted.current) {
                setMode('idle');
            }
            return;
        }
        endAccess('session_lost');
        if (current === attempt.current && mounted.current) {
            setMode('unavailable');
        }
    }, [router, target]);

    useEffect(() => {
        // Async restore reads external Auth state; state updates happen after
        // the awaited session probe, not synchronously in this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void restore();
    }, [restore]);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const capturedEmail = email.trim();
        const capturedPassword = password;
        setPassword('');
        setMessage(null);
        setMode('submitting');
        const current = ++attempt.current;

        try {
            await signInWithPassword(capturedEmail, capturedPassword);
        } catch (error) {
            if (current !== attempt.current || !mounted.current) {
                return;
            }
            if (error instanceof AccessSignInError) {
                setMessage('Email or password is incorrect.');
                setMode('idle');
            } else if (error instanceof AuthServiceUnavailable) {
                setMode('unavailable');
            } else if (error instanceof AccessConfigurationError) {
                setMode('unconfigured');
            } else {
                setMessage('Sign-in failed. Try again.');
                setMode('idle');
            }
            return;
        }

        beginAccess();
        const probe = await probeOperatorSession();
        if (current !== attempt.current || !mounted.current) {
            return;
        }
        if (probe.status === 'ready') {
            router.replace(target);
            return;
        }
        if (probe.status === 'forbidden') {
            endAccess('operator_denied');
            await signOutEverywhere().catch(() => {});
            if (current === attempt.current && mounted.current) {
                setMode('forbidden');
            }
            return;
        }
        endAccess('session_lost');
        if (current === attempt.current && mounted.current) {
            setMode(probe.status === 'signed-out' ? 'idle' : 'unavailable');
        }
    }

    return (
        <main id="main-content" className="flex min-h-screen items-center justify-center bg-canvas px-4 text-ink" tabIndex={-1}>
            <div className="w-full max-w-sm space-y-6">
                <div className="space-y-2 text-center">
                    <p className="type-meta-strong uppercase tracking-[0.25em] text-action">
                        Operator access
                    </p>
                    <h1 className="type-page-title">Sign in to Sabha</h1>
                    <p className="type-body text-ink-secondary">
                        Public visitors can still open the guided replay without an
                        account.
                    </p>
                </div>

                {mode === 'checking' && (
                    <p className="text-center type-body text-ink-muted">
                        Checking sign-in…
                    </p>
                )}

                {mode === 'unavailable' && (
                    <div
                        role="alert"
                        className="space-y-3 rounded-group border border-warning/40 bg-warning-soft p-4 type-body"
                    >
                        <p className="text-warning">
                            Sign-in is temporarily unavailable. Your session was not
                            changed.
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                                setMessage(null);
                                setMode('checking');
                                void restore();
                            }}
                        >
                            Retry
                        </Button>
                    </div>
                )}

                {mode === 'forbidden' && (
                    <div
                        role="alert"
                        className="space-y-3 rounded-group border border-danger/40 bg-danger-soft p-4 type-body"
                    >
                        <p className="text-danger">
                            This account is not the operator for this workspace.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                void signOutEverywhere().catch(() => {});
                                setPassword('');
                                setMode('idle');
                            }}
                        >
                            Sign out
                        </Button>
                    </div>
                )}

                {mode === 'unconfigured' && (
                    <div className="space-y-3 rounded-group border border-separator bg-surface-raised p-4 type-body text-ink-secondary">
                        <p>Operator sign-in is not configured for this deployment.</p>
                        <a href="/demo" className="text-action hover:text-action-hover">
                            Open guided replay
                        </a>
                    </div>
                )}

                {(mode === 'idle' || mode === 'submitting') && (
                    <form className="space-y-4" onSubmit={submit}>
                        <label className="block space-y-1.5">
                            <span className="type-control text-ink">Email</span>
                            <Input
                                type="email"
                                name="email"
                                autoComplete="username"
                                required
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                disabled={mode === 'submitting'}
                            />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="type-control text-ink">Password</span>
                            <Input
                                type="password"
                                name="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                disabled={mode === 'submitting'}
                            />
                        </label>
                        {message && (
                            <p role="alert" className="type-body text-danger">
                                {message}
                            </p>
                        )}
                        <Button
                            type="submit"
                            className="w-full"
                            busy={mode === 'submitting'}
                            busyLabel="Signing in"
                        >
                            Sign in
                        </Button>
                    </form>
                )}

                <div className="text-center type-meta text-ink-muted">
                    <a href="/demo" className="hover:text-ink-secondary">
                        Return to guided replay
                    </a>
                </div>
            </div>
        </main>
    );
}
