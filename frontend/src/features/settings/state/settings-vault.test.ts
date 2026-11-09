/**
 * Functional spec: browser provider keys live in an encrypted vault.
 * Only ciphertext (and a random salt) may persist to localStorage; the
 * passphrase-derived AES key and the plaintext keys exist solely in module
 * memory and vanish on lock or refresh. ProviderConfig never carries a key:
 * a blank input means "no draft", not "no stored credential".
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from './settings-store';

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
        expect(await state.createVault('correct vault phrase')).toBe(true);
        const saved = await state.saveProviderKey('gemini', 'sk-live-secret');
        expect(saved.ok).toBe(true);
        state.setProviderConfig('gemini', { model: 'gemini-2.0-flash' });

        const raw = persistedRaw();
        expect(raw).toContain('gemini');
        expect(raw).not.toContain('sk-live-secret');
        expect(raw).not.toContain('correct vault phrase');
        const parsed = JSON.parse(raw);
        expect(parsed.state.vaultCiphertexts?.gemini).toBeTruthy();
        expect(parsed.state.providers.gemini.apiKey).toBeUndefined();
        expect(useSettingsStore.getState().providers.gemini).not.toHaveProperty('apiKey');
        expect(useSettingsStore.getState().vaultUnlocked).toBe(true);
    });

    it('hands keys to generation only while the vault is unlocked', async () => {
        const state = useSettingsStore.getState();
        await state.createVault('correct vault phrase');
        await state.saveProviderKey('gemini', 'sk-live-secret');
        state.setProviderConfig('gemini', {
            model: 'gemini-2.0-flash',
            temperature: 0.2,
        });
        state.setDefaultProvider('gemini');
        state.setProviderConfig('gemini', { enabled: true });

        const settings = useSettingsStore.getState().composeGenerationSettings();
        expect(settings?.provider).toBe('gemini');
        expect(settings?.apiKey).toBe('sk-live-secret');
        expect(settings?.model).toBe('gemini-2.0-flash');
        expect(settings?.temperature).toBe(0.2);

        useSettingsStore.getState().lockVault();
        const afterLock = useSettingsStore.getState().composeGenerationSettings();
        expect(afterLock?.provider).toBe('gemini'); // non-secret config survives
        expect(afterLock?.apiKey).toBeUndefined(); // locked → no key leaves memory
        expect(useSettingsStore.getState().vaultUnlocked).toBe(false);
    });

    it('refuses to store keys while the vault is locked without dropping config edits', async () => {
        // A fresh tab starts locked; saving a key must not stash plaintext.
        const state = useSettingsStore.getState();
        state.setProviderConfig('gemini', { model: 'gemini-2.0-flash' });
        const saved = await state.saveProviderKey('gemini', 'sk-live-secret');

        expect(saved.ok).toBe(false);
        expect(useSettingsStore.getState().providers.gemini).not.toHaveProperty('apiKey');
        expect(useSettingsStore.getState().providers.gemini.model).toBe('gemini-2.0-flash');
        expect(useSettingsStore.getState().vaultError).toBeTruthy();
        expect(persistedRaw()).not.toContain('sk-live-secret');
    });

    it('rejects a wrong passphrase when ciphertext exists', async () => {
        const state = useSettingsStore.getState();
        await state.createVault('correct vault phrase');
        await state.saveProviderKey('openrouter', 'sk-router-secret');
        state.lockVault();

        expect(await state.unlockVault('wrong vault phrase')).toBe(false);
        expect(useSettingsStore.getState().vaultUnlocked).toBe(false);
        expect(
            useSettingsStore.getState().composeGenerationSettings()?.apiKey
        ).toBeUndefined();
    });

    it('rehydrates locked so ciphertexts exist without any key in memory', async () => {
        const state = useSettingsStore.getState();
        await state.createVault('correct vault phrase');
        await state.saveProviderKey('openrouter', 'sk-router-secret');

        // "New tab": lock clears memory, persisted ciphertext survives.
        state.lockVault();
        const parsed = JSON.parse(persistedRaw());
        expect(parsed.state.vaultCiphertexts.openrouter).toBeTruthy();
        expect(useSettingsStore.getState().composeGenerationSettings()?.apiKey).toBeUndefined();
    });

    it('updates and removes stored keys without exposing them in config', async () => {
        const state = useSettingsStore.getState();
        await state.createVault('correct vault phrase');
        await state.saveProviderKey('gemini', 'sk-first');
        await state.saveProviderKey('gemini', 'sk-second');

        expect(state.hasStoredKey('gemini')).toBe(true);
        expect(state.getProviderApiKey('gemini')).toBe('sk-second');

        useSettingsStore.getState().removeProviderKey('gemini');
        expect(useSettingsStore.getState().hasStoredKey('gemini')).toBe(false);
        expect(useSettingsStore.getState().getProviderApiKey('gemini')).toBeUndefined();
        expect(persistedRaw()).not.toContain('sk-second');
    });

    it('re-encrypts stored keys when the passphrase changes', async () => {
        const state = useSettingsStore.getState();
        await state.createVault('correct vault phrase');
        await state.saveProviderKey('openrouter', 'sk-router-secret');

        expect(await state.changeVaultPassphrase('new vault phrase')).toBe(true);
        state.lockVault();

        expect(await state.unlockVault('correct vault phrase')).toBe(false);
        expect(await state.unlockVault('new vault phrase')).toBe(true);
        expect(state.getProviderApiKey('openrouter')).toBe('sk-router-secret');
    });

    it('does not resurrect an unlock that finishes after access loss', async () => {
        const state = useSettingsStore.getState();
        await state.createVault('correct vault phrase');
        await state.saveProviderKey('openrouter', 'sk-router-secret');
        state.lockVault();

        const pending = state.unlockVault('correct vault phrase');
        state.lockVault(); // access loss while PBKDF2 is still running
        expect(await pending).toBe(false);
        expect(useSettingsStore.getState().vaultUnlocked).toBe(false);
        expect(useSettingsStore.getState().getProviderApiKey('openrouter')).toBeUndefined();
    });
});
