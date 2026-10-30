import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeQueryClient } from '@/shared/query/client';
import { endAccess, getAccessSnapshot } from '@/shared/access';

const replace = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ replace }));
const hasLocalSession = vi.hoisted(() => vi.fn());
const isAuthConfigured = vi.hoisted(() => vi.fn());
const signOutEverywhere = vi.hoisted(() => vi.fn(async () => {}));
const probeOperatorSession = vi.hoisted(() => vi.fn());
const clearPrivateScope = vi.hoisted(() => vi.fn());
const registerPrivateScope = vi.hoisted(() => vi.fn());
const startAuthLifecycle = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    useRouter: () => router,
    usePathname: () => '/meetings',
}));

vi.mock('@/shared/access', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/shared/access')>();
    return {
        ...actual,
        hasLocalSession,
        isAuthConfigured,
        signOutEverywhere,
    };
});

vi.mock('../api/session', () => ({ probeOperatorSession }));
vi.mock('../state/private-scope', () => ({
    clearPrivateScope,
    registerPrivateScope,
}));
vi.mock('../state/auth-lifecycle', () => ({ startAuthLifecycle }));

import { OperatorAccessProvider } from './operator-access-provider';

function renderProvider() {
    return render(
        <QueryClientProvider client={makeQueryClient()}>
            <OperatorAccessProvider>
                <div>private child</div>
            </OperatorAccessProvider>
        </QueryClientProvider>
    );
}

describe('operator access boundary', () => {
    beforeEach(() => {
        endAccess('signed_out');
        replace.mockReset();
        hasLocalSession.mockReset().mockResolvedValue(true);
        isAuthConfigured.mockReset().mockReturnValue(true);
        probeOperatorSession.mockReset();
        clearPrivateScope.mockReset();
        registerPrivateScope.mockReset();
        startAuthLifecycle.mockReset();
        signOutEverywhere.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => {
        endAccess('signed_out');
    });

    it('does not mount private children until the backend probe admits', async () => {
        let resolveProbe: (value: { status: 'ready' }) => void = () => {};
        probeOperatorSession.mockReturnValue(
            new Promise((resolve) => {
                resolveProbe = resolve;
            })
        );

        renderProvider();

        expect(screen.queryByText('private child')).toBeNull();
        expect(screen.getByText(/Checking operator access/i)).toBeTruthy();

        await act(async () => {
            resolveProbe({ status: 'ready' });
        });

        await waitFor(() =>
            expect(screen.getByText('private child')).toBeTruthy()
        );
        expect(hasLocalSession).toHaveBeenCalled();
    });

    it('shows a distinct forbidden state for a valid non-operator', async () => {
        probeOperatorSession.mockResolvedValue({ status: 'forbidden' });

        renderProvider();

        await waitFor(() =>
            expect(screen.getByText(/Operator access denied/i)).toBeTruthy()
        );
        expect(screen.queryByText('private child')).toBeNull();
        expect(replace).not.toHaveBeenCalled();
    });

    it('offers a retry rather than auto sign-out on an Auth outage', async () => {
        probeOperatorSession
            .mockResolvedValueOnce({ status: 'unavailable' })
            .mockResolvedValueOnce({ status: 'ready' });

        renderProvider();

        await waitFor(() =>
            expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy()
        );
        expect(replace).not.toHaveBeenCalled();

        await act(async () => {
            screen.getByRole('button', { name: /retry/i }).click();
        });

        await waitFor(() =>
            expect(screen.getByText('private child')).toBeTruthy()
        );
    });

    it('redirects a signed-out visitor with a safe live target', async () => {
        hasLocalSession.mockResolvedValue(false);

        renderProvider();

        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith('/login?next=%2Fmeetings')
        );
        expect(screen.queryByText('private child')).toBeNull();
    });

    it('ends admission immediately on sign-out and clears the private scope', async () => {
        probeOperatorSession.mockResolvedValue({ status: 'ready' });

        renderProvider();
        await waitFor(() =>
            expect(screen.getByText('private child')).toBeTruthy()
        );

        await act(async () => {
            screen.getByRole('button', { name: /sign out/i }).click();
        });

        expect(getAccessSnapshot().active).toBe(false);
        expect(clearPrivateScope).toHaveBeenCalled();
        expect(signOutEverywhere).toHaveBeenCalled();
        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith('/login?next=%2Fmeetings')
        );
    });

    it('reacts to a session loss reported by the live transport', async () => {
        probeOperatorSession.mockResolvedValue({ status: 'ready' });

        renderProvider();
        await waitFor(() =>
            expect(screen.getByText('private child')).toBeTruthy()
        );

        await act(async () => {
            endAccess('token_invalid');
        });

        await waitFor(() =>
            expect(screen.queryByText('private child')).toBeNull()
        );
        expect(clearPrivateScope).toHaveBeenCalled();
    });
});
