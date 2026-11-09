// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('./ProvidersSection', () => ({
    ProvidersSection: () => <div data-testid="providers-section" />,
}));
vi.mock('./SystemAiSection', () => ({
    SystemAiSection: () => <div data-testid="system-ai-section" />,
}));
vi.mock('./CredentialsSection', () => ({
    CredentialsSection: () => <div data-testid="credentials-section" />,
}));
vi.mock('./AppearanceSection', () => ({
    AppearanceSection: () => <div data-testid="appearance-section" />,
}));
vi.mock('./DiagnosticsSection', () => ({
    DiagnosticsSection: () => <div data-testid="diagnostics-section" />,
}));

import { SettingsScreen } from './SettingsScreen';

describe('settings section shell', () => {
    it('opens on providers and exposes only real sections', () => {
        render(<SettingsScreen />);

        expect(screen.getByTestId('providers-section')).toBeTruthy();
        expect(screen.queryByText(/coming soon/i)).toBeNull();
        expect(screen.queryByText('Notifications')).toBeNull();
        expect(screen.queryByText('Privacy')).toBeNull();

        for (const name of ['Providers', 'System AI', 'Credentials', 'Appearance', 'Diagnostics']) {
            expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
        }
    });

    it('navigates between editable sections', () => {
        render(<SettingsScreen />);

        fireEvent.click(screen.getByRole('button', { name: /System AI/ }));
        expect(screen.getByTestId('system-ai-section')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Credentials/ }));
        expect(screen.getByTestId('credentials-section')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
        expect(screen.getByTestId('appearance-section')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Appearance/ })).toHaveAttribute(
            'aria-current',
            'page'
        );

        fireEvent.click(screen.getByRole('button', { name: /Diagnostics/ }));
        expect(screen.getByTestId('diagnostics-section')).toBeTruthy();
    });
});
