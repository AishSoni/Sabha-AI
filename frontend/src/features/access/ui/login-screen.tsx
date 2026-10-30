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

import { probeOperatorSession } from '../api/session';
import { safeReturnTarget } from '../state/return-target';

type LoginMode =
    | 'checking'
    | 'idle'
    | 'submitting'
    | 'unavailable'
    | 'forbidden'
    | 'unconfigured';

const INPUT =
    'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none';

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
        <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
            <div className="w-full max-w-sm space-y-6">
                <div className="space-y-2 text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
                        Operator access
                    </p>
                    <h1 className="text-2xl font-semibold">Sign in to Sabha</h1>
                    <p className="text-sm text-neutral-400">
                        Public visitors can still open the guided replay without an
                        account.
                    </p>
                </div>

                {mode === 'checking' && (
                    <p className="text-center text-sm text-neutral-400">
                        Checking sign-in…
                    </p>
                )}

                {mode === 'unavailable' && (
                    <div className="space-y-3 rounded-md border border-amber-700/60 bg-amber-950/20 p-4 text-sm">
                        <p className="text-amber-200">
                            Sign-in is temporarily unavailable. Your session was not
                            changed.
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setMessage(null);
                                setMode('checking');
                                void restore();
                            }}
                            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {mode === 'forbidden' && (
                    <div className="space-y-3 rounded-md border border-red-800/60 bg-red-950/20 p-4 text-sm">
                        <p className="text-red-200">
                            This account is not the operator for this workspace.
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                void signOutEverywhere().catch(() => {});
                                setPassword('');
                                setMode('idle');
                            }}
                            className="rounded-md border border-red-700 px-3 py-1.5 text-xs font-medium text-red-100 hover:border-red-500"
                        >
                            Sign out
                        </button>
                    </div>
                )}

                {mode === 'unconfigured' && (
                    <div className="space-y-3 rounded-md border border-neutral-700 bg-neutral-900 p-4 text-sm text-neutral-300">
                        <p>Operator sign-in is not configured for this deployment.</p>
                        <a href="/demo" className="text-emerald-400 hover:text-emerald-300">
                            Open guided replay
                        </a>
                    </div>
                )}

                {(mode === 'idle' || mode === 'submitting') && (
                    <form className="space-y-4" onSubmit={submit}>
                        <label className="block space-y-1.5 text-sm">
                            <span className="text-neutral-300">Email</span>
                            <input
                                className={INPUT}
                                type="email"
                                name="email"
                                autoComplete="username"
                                required
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                disabled={mode === 'submitting'}
                            />
                        </label>
                        <label className="block space-y-1.5 text-sm">
                            <span className="text-neutral-300">Password</span>
                            <input
                                className={INPUT}
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
                            <p role="alert" className="text-sm text-red-300">
                                {message}
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={mode === 'submitting'}
                            className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {mode === 'submitting' ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>
                )}

                <div className="text-center text-xs text-neutral-500">
                    <a href="/demo" className="hover:text-neutral-300">
                        Return to guided replay
                    </a>
                </div>
            </div>
        </main>
    );
}
