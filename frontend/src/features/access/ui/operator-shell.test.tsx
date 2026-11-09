import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppearanceProvider } from '@/components/appearance';

const pathname = vi.hoisted(() => ({ current: '/meetings' }));

vi.mock('next/navigation', () => ({
    usePathname: () => pathname.current,
}));

import { OperatorShell } from './operator-shell';

function renderShell(onLogout = vi.fn()) {
    const view = render(
        <AppearanceProvider>
            <OperatorShell onLogout={onLogout}>
                <div>workspace child</div>
            </OperatorShell>
        </AppearanceProvider>
    );
    return { ...view, onLogout };
}

describe('operator live navigation', () => {
    it('hides global navigation until the Live trigger is activated', () => {
        renderShell();

        expect(screen.getByText('workspace child')).toBeInTheDocument();
        expect(screen.queryByText('Operator')).not.toBeInTheDocument();
        expect(screen.queryByText('Recorded demo')).not.toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Live navigation' })).toBeNull();

        fireEvent.click(
            screen.getByRole('button', { name: 'Open Live navigation' })
        );

        expect(
            screen.getByRole('navigation', { name: 'Live navigation' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Meeting space' })
        ).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: 'AI roster' })).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Knowledge stacks' })
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
        expect(screen.queryByText('Recorded demo')).not.toBeInTheDocument();
    });

    it('returns focus to the trigger and closes on a route change', async () => {
        const { rerender } = renderShell();
        const trigger = screen.getByRole('button', {
            name: 'Open Live navigation',
        });

        fireEvent.click(trigger);
        expect(
            screen.getByRole('navigation', { name: 'Live navigation' })
        ).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() =>
            expect(
                screen.queryByRole('navigation', { name: 'Live navigation' })
            ).toBeNull()
        );
        expect(trigger).toHaveFocus();

        pathname.current = '/roster';
        fireEvent.click(
            screen.getByRole('button', { name: 'Open Live navigation' })
        );
        rerender(
            <AppearanceProvider>
                <OperatorShell onLogout={vi.fn()}>
                    <div>workspace child</div>
                </OperatorShell>
            </AppearanceProvider>
        );

        await waitFor(() =>
            expect(
                screen.queryByRole('navigation', { name: 'Live navigation' })
            ).toBeNull()
        );
    });

    it('signs out from the navigation sheet', () => {
        const { onLogout } = renderShell();

        fireEvent.click(
            screen.getByRole('button', { name: 'Open Live navigation' })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

        expect(onLogout).toHaveBeenCalledTimes(1);
    });
});
