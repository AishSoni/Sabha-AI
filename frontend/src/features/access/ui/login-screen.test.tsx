import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { endAccess, getAccessSnapshot } from '@/shared/access';

const replace = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ replace }));
const searchParams = vi.hoisted(() => new URLSearchParams());
const hasLocalSession = vi.hoisted(() => vi.fn());
const isAuthConfigured = vi.hoisted(() => vi.fn());
const signInWithPassword = vi.hoisted(() => vi.fn());
const signOutEverywhere = vi.hoisted(() => vi.fn(async () => {}));
const probeOperatorSession = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    useRouter: () => router,
    useSearchParams: () => searchParams,
}));

vi.mock('@/shared/access', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/shared/access')>();
    class AccessSignInError extends Error {}
    class AuthServiceUnavailable extends Error {}
    class AccessConfigurationError extends Error {}
    return {
        ...actual,
        AccessConfigurationError,
        AccessSignInError,
        AuthServiceUnavailable,
        hasLocalSession,
        isAuthConfigured,
        signInWithPassword,
        signOutEverywhere,
    };
});

vi.mock('../api/session', () => ({ probeOperatorSession }));

import { LoginScreen } from './login-screen';

function submit(email = 'operator@example.com', password = 'secret') {
    fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: password },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
}

describe('operator login screen', () => {
    beforeEach(() => {
        endAccess('signed_out');
        replace.mockReset();
        searchParams.delete('next');
        hasLocalSession.mockReset().mockResolvedValue(false);
        isAuthConfigured.mockReset().mockReturnValue(true);
        signInWithPassword.mockReset();
        signOutEverywhere.mockReset().mockResolvedValue(undefined);
        probeOperatorSession.mockReset();
    });

    afterEach(() => {
        endAccess('signed_out');
    });

    it('shows a generic bad-credential error and clears the password', async () => {
        const session = await import('@/shared/access');
        signInWithPassword.mockRejectedValue(new session.AccessSignInError());

        render(<LoginScreen />);
        await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

        await act(async () => {
            submit();
        });

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toMatch(
                /email or password is incorrect/i
            )
        );
        expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe(
            ''
        );
        expect(screen.queryByText(/workspace/i)).toBeNull();
    });

    it('signs in, probes, and returns only to a safe target', async () => {
        searchParams.set('next', '//evil.example/meetings');
        signInWithPassword.mockResolvedValue('token');
        probeOperatorSession.mockResolvedValue({ status: 'ready' });

        render(<LoginScreen />);
        await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

        await act(async () => {
            submit();
        });

        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith('/meetings')
        );
        expect(getAccessSnapshot().active).toBe(true);
    });

    it('does not keep a non-operator session and explains the denial', async () => {
        signInWithPassword.mockResolvedValue('token');
        probeOperatorSession.mockResolvedValue({ status: 'forbidden' });

        render(<LoginScreen />);
        await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

        await act(async () => {
            submit();
        });

        await waitFor(() =>
            expect(screen.getByText(/not the operator/i)).toBeTruthy()
        );
        expect(signOutEverywhere).toHaveBeenCalled();
        expect(getAccessSnapshot().active).toBe(false);
        expect(replace).not.toHaveBeenCalled();
    });

    it('keeps the form after an Auth outage and offers retry', async () => {
        const session = await import('@/shared/access');
        signInWithPassword.mockRejectedValue(new session.AuthServiceUnavailable());

        render(<LoginScreen />);
        await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

        await act(async () => {
            submit();
        });

        await waitFor(() =>
            expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy()
        );
        expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    });
});
