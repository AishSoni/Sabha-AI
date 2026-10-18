/**
 * Functional spec: browser provider keys live in an encrypted vault.
 * Only ciphertext (and a random salt) may persist to localStorage; the
 * passphrase-derived AES key and the plaintext keys exist solely in module
 * memory and vanish on lock or refresh.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';

const STORAGE_KEY = 'sabha-settings';

const persistedRaw = (): string => window.localStorage.getItem(STORAGE_KEY) ?? '';

describe('provider key vault', () => {
    beforeEach(() => {
        window.localStorage.clear();
        useSettingsStore.getState().resetAllSettings();
        useSettingsStore.getState().lockVault();
    });

    it('stores provider keys encrypted and never as plaintext', async () => {
        const state = useSettingsStore.getState();
        expect(await state.unlockVault('correct vault phrase')).toBe(true);
        await state.setProviderConfig('gemini', {
            apiKey: 'sk-live-secret',
            model: 'gemini-2.0-flash',
        });

        const raw = persistedRaw();
        expect(raw).toContain('gemini');
        expect(raw).not.toContain('sk-live-secret'); // ← RED pre-fix (plaintext)
        expect(raw).not.toContain('correct vault phrase'); // passphrase never persisted
        const parsed = JSON.parse(raw);
        expect(parsed.state.vaultCiphertexts?.gemini).toBeTruthy(); // ← RED pre-fix
        // The live provider config never carries the secret either.
        expect(useSettingsStore.getState().providers.gemini.apiKey).not.toBe(
            'sk-live-secret'
        );
        expect(useSettingsStore.getState().vaultUnlocked).toBe(true);
    });

    it('hands keys to generation only while the vault is unlocked', async () => {
        const state = useSettingsStore.getState();
        await state.unlockVault('correct vault phrase');
        await state.setProviderConfig('gemini', {
            apiKey: 'sk-live-secret',
            model: 'gemini-2.0-flash',
            temperature: 0.2,
        });
        state.setDefaultProvider('gemini');
        await state.setProviderConfig('gemini', { enabled: true });

        const settings = useSettingsStore.getState().composeGenerationSettings();
        expect(settings?.provider).toBe('gemini');
        expect(settings?.apiKey).toBe('sk-live-secret'); // ← RED pre-fix (method missing)
        expect(settings?.model).toBe('gemini-2.0-flash');
        expect(settings?.temperature).toBe(0.2);

        useSettingsStore.getState().lockVault();
        const afterLock = useSettingsStore.getState().composeGenerationSettings();
        expect(afterLock?.provider).toBe('gemini'); // non-secret config survives
        expect(afterLock?.apiKey).toBeUndefined(); // locked → no key leaves memory
        expect(useSettingsStore.getState().vaultUnlocked).toBe(false);
    });

    it('refuses to store keys while the vault is locked', async () => {
        // A fresh tab starts locked; saving a key must not stash plaintext.
        await useSettingsStore.getState().setProviderConfig('gemini', {
            apiKey: 'sk-live-secret',
            model: 'gemini-2.0-flash',
        });

        expect(useSettingsStore.getState().providers.gemini.apiKey).not.toBe(
            'sk-live-secret' // ← RED pre-fix
        );
        expect(useSettingsStore.getState().vaultError).toBeTruthy();
        expect(persistedRaw()).not.toContain('sk-live-secret');
    });

    it('rejects a wrong passphrase when ciphertext exists', async () => {
        const state = useSettingsStore.getState();
        await state.unlockVault('correct vault phrase');
        await state.setProviderConfig('openrouter', { apiKey: 'sk-router-secret' });
        state.lockVault();

        expect(await state.unlockVault('wrong vault phrase')).toBe(false);
        expect(useSettingsStore.getState().vaultUnlocked).toBe(false);
        expect(
            useSettingsStore.getState().composeGenerationSettings()?.apiKey
        ).toBeUndefined();
    });

    it('rehydrates locked so ciphertexts exist without any key in memory', async () => {
        const state = useSettingsStore.getState();
        await state.unlockVault('correct vault phrase');
        await state.setProviderConfig('openrouter', { apiKey: 'sk-router-secret' });

        // "New tab": lock clears memory, persisted ciphertext survives.
        state.lockVault();
        const parsed = JSON.parse(persistedRaw());
        expect(parsed.state.vaultCiphertexts.openrouter).toBeTruthy();
        expect(useSettingsStore.getState().composeGenerationSettings()?.apiKey).toBeUndefined();
    });
});
