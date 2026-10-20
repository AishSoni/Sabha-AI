/**
 * Contract for the non-persisted vault capability (spec-05, shared credentials).
 *
 * The vault owns everything secret-shaped: key derivation, sealing, opening,
 * and the in-memory plaintexts. Callers (the settings store) own persistence
 * of sealed envelopes only. No passphrase, derived key, or plaintext may ever
 * be persisted, and every failure path leaves the vault locked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64ToBytes, bytesToBase64 } from './envelope';
import {
    forgetInVault,
    lockVault,
    observeVaultStorage,
    openVault,
    revealFromVault,
    sealIntoVault,
} from './vault';

const b64 = (length: number, fill = 1) => {
    const bytes = new Uint8Array(length).fill(fill);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
};

/**
 * Builds a legacy-format sealed payload (base64 of iv+ciphertext) with a
 * key derived independently of the vault module — the legacy read path must
 * work against keys derived the plain WebCrypto way.
 */
const legacyPacked = async (passphrase: string, salt: string, plaintext: string) => {
    const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase) as unknown as BufferSource,
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: base64ToBytes(salt) as unknown as BufferSource, iterations: 210_000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
    const iv = new Uint8Array(12).fill(7);
    const encrypted = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as unknown as BufferSource },
            key,
            new TextEncoder().encode(plaintext) as unknown as BufferSource,
        ),
    );
    const packed = new Uint8Array(iv.length + encrypted.length);
    packed.set(iv, 0);
    packed.set(encrypted, iv.length);
    return bytesToBase64(packed);
};

afterEach(() => {
    lockVault();
});

describe('openVault', () => {
    it('creates a fresh salt on first unlock and seals into memory', async () => {
        const result = await openVault('correct vault phrase', null, {});

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(base64ToBytes(result.salt)).toHaveLength(16);

        const sealed = await sealIntoVault('gemini', 'sk-live-secret');
        expect(sealed).not.toBeNull();
        expect(sealed).not.toContain('sk-live-secret');
        expect(revealFromVault('gemini')).toBe('sk-live-secret');
    });

    it('proves the passphrase against existing sealed payloads and reveals them', async () => {
        const first = await openVault('correct vault phrase', null, {});
        if (!first.ok) throw new Error('first unlock must succeed');
        const sealed = await sealIntoVault('openrouter', 'sk-router-secret');
        lockVault();

        const second = await openVault('correct vault phrase', first.salt, {
            openrouter: sealed as string,
        });

        expect(second.ok).toBe(true);
        expect(revealFromVault('openrouter')).toBe('sk-router-secret');
    });

    it('stays locked on a wrong passphrase and clears partial plaintexts', async () => {
        const first = await openVault('correct vault phrase', null, {});
        if (!first.ok) throw new Error('first unlock must succeed');
        const sealed = await sealIntoVault('openrouter', 'sk-router-secret');
        lockVault();

        const wrong = await openVault('wrong vault phrase', first.salt, {
            openrouter: sealed as string,
        });

        expect(wrong.ok).toBe(false);
        if (wrong.ok) return;
        expect(wrong.error).toMatch(/incorrect passphrase/i);
        expect(revealFromVault('openrouter')).toBeUndefined();
        expect(await sealIntoVault('openrouter', 'sk-router-secret')).toBeNull();
    });

    it('stays locked when a sealed payload is corrupted', async () => {
        const first = await openVault('correct vault phrase', null, {});
        if (!first.ok) throw new Error('first unlock must succeed');
        const sealed = await sealIntoVault('openrouter', 'sk-router-secret');
        lockVault();

        // Tamper with the envelope's ciphertext before reopening.
        const envelope = JSON.parse(sealed as string) as { ciphertext: string };
        const bytes = base64ToBytes(envelope.ciphertext);
        bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
        envelope.ciphertext = bytesToBase64(bytes);

        const corrupt = await openVault('correct vault phrase', first.salt, {
            openrouter: JSON.stringify(envelope),
        });

        expect(corrupt.ok).toBe(false);
        expect(revealFromVault('openrouter')).toBeUndefined();
    });

    it('opens legacy packed payloads using the caller-supplied salt', async () => {
        const salt = b64(16, 4);
        const packed = await legacyPacked('legacy passphrase', salt, 'sk-legacy-secret');

        const result = await openVault('legacy passphrase', salt, {
            openrouter: packed,
        });

        expect(result.ok).toBe(true);
        expect(revealFromVault('openrouter')).toBe('sk-legacy-secret');
    });

    it('treats an unusable persisted salt as absent and fails safe', async () => {
        const packed = await legacyPacked('legacy passphrase', b64(16, 4), 'sk-legacy-secret');

        // 'not-a-salt' cannot decode; the vault must not crash — it must
        // simply fail the proof against payloads it cannot read.
        const result = await openVault('legacy passphrase', 'not-a-salt', {
            openrouter: packed,
        });

        expect(result.ok).toBe(false);
        expect(revealFromVault('openrouter')).toBeUndefined();
    });
});

describe('vault memory', () => {
    it('forgets a single credential and locks everything on demand', async () => {
        await openVault('correct vault phrase', null, {});
        await sealIntoVault('gemini', 'sk-gemini');
        await sealIntoVault('openrouter', 'sk-router');

        forgetInVault('gemini');
        expect(revealFromVault('gemini')).toBeUndefined();
        expect(revealFromVault('openrouter')).toBe('sk-router');

        lockVault();
        expect(revealFromVault('openrouter')).toBeUndefined();
        expect(await sealIntoVault('openrouter', 'sk-router')).toBeNull();
    });
});

describe('cross-tab invalidation', () => {
    it('notifies on storage writes for the vault key only', () => {
        const onExternalWrite = vi.fn();
        const listeners = new Map<string, (event: { key: string | null }) => void>();
        const target = {
            addEventListener: (_type: string, handler: (event: { key: string | null }) => void) => {
                listeners.set('storage', handler);
            },
            removeEventListener: (_type: string) => {
                listeners.delete('storage');
            },
        };

        const detach = observeVaultStorage(target, 'sabha-settings', onExternalWrite);

        listeners.get('storage')?.({ key: 'sabha-settings' });
        expect(onExternalWrite).toHaveBeenCalledTimes(1);

        listeners.get('storage')?.({ key: 'unrelated' });
        listeners.get('storage')?.({ key: null });
        expect(onExternalWrite).toHaveBeenCalledTimes(1);

        detach();
        listeners.get('storage')?.({ key: 'sabha-settings' });
        expect(onExternalWrite).toHaveBeenCalledTimes(1);
    });
});
