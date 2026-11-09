// @vitest-environment happy-dom
/**
 * Spec-37: vault state must be visible and truthful. Creating, locking,
 * unlocking, and a wrong passphrase all have explicit UI states.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VaultCard } from './VaultCard';
import { useSettingsStore } from '../state/settings-store';

describe('VaultCard', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useSettingsStore.getState().resetAllSettings();
        useSettingsStore.getState().lockVault();
    });

    it('creates a vault, reports the unlocked state, and locks again', async () => {
        render(<VaultCard />);

        expect(screen.getByText('Locked')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Passphrase'), {
            target: { value: 'correct vault phrase' },
        });
        fireEvent.change(screen.getByLabelText('Confirm passphrase'), {
            target: { value: 'correct vault phrase' },
        });
        fireEvent.click(screen.getByRole('button', { name: /create vault/i }));

        await screen.findByText(/0 stored provider keys are available/i);
        expect(useSettingsStore.getState().vaultUnlocked).toBe(true);
        expect(screen.getByText('Unlocked')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /lock vault/i }));
        expect(useSettingsStore.getState().vaultUnlocked).toBe(false);
        expect(screen.getByText('Locked')).toBeTruthy();
    });

    it('shows an actionable error for a wrong passphrase and stays locked', async () => {
        await act(async () => {
            await useSettingsStore.getState().createVault('correct vault phrase');
            await useSettingsStore.getState().saveProviderKey('openrouter', 'sk-secret');
            useSettingsStore.getState().lockVault();
        });

        render(<VaultCard />);
        expect(screen.getByText(/Unlock to use 1 stored provider key/i)).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Passphrase'), {
            target: { value: 'wrong vault phrase' },
        });
        fireEvent.click(screen.getByRole('button', { name: /unlock vault/i }));

        await screen.findByText(/Incorrect passphrase/i);
        expect(useSettingsStore.getState().vaultUnlocked).toBe(false);
        expect(useSettingsStore.getState().getProviderApiKey('openrouter')).toBeUndefined();
    });
});
