/**
 * Non-persisted vault capability (spec-05, shared credentials).
 *
 * The vault owns everything secret-shaped: passphrase-derived key, sealing,
 * opening, and the in-memory plaintexts. No passphrase, derived key, or
 * plaintext is ever persisted — module memory vanishes on lock or refresh,
 * and every failure path (wrong passphrase, corruption, unusable salt) leaves
 * the vault locked. Persistence of sealed envelopes is the caller's job (the
 * settings store persists ciphertexts only).
 */
import {
    CredentialEnvelope,
    PBKDF2_ITERATIONS,
    base64ToBytes,
    bytesToBase64,
    decodeLegacyPacked,
    parseEnvelope,
    serializeEnvelope,
} from './envelope';

const SALT_BYTES = 16;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Module memory is the ONLY place plaintext keys and the derived key exist.
const inMemoryKeys = new Map<string, string>();
let vaultKey: CryptoKey | null = null;
let vaultSalt: Uint8Array | null = null;

async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase) as unknown as BufferSource,
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function openCredential(key: CryptoKey, payload: string): Promise<string> {
    const envelope = parseEnvelope(payload);
    if (envelope) {
        return decoder.decode(
            await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: base64ToBytes(envelope.cipher.iv) as unknown as BufferSource },
                key,
                base64ToBytes(envelope.ciphertext) as unknown as BufferSource,
            ),
        );
    }

    // Payloads written before the envelope existed are iv+ciphertext blobs
    // sealed with the vault-level salt the caller passes to openVault.
    const legacy = decodeLegacyPacked(payload);
    if (legacy) {
        return decoder.decode(
            await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: legacy.iv as unknown as BufferSource },
                key,
                legacy.ciphertext as unknown as BufferSource,
            ),
        );
    }

    throw new Error('Unreadable sealed credential');
}

export type VaultUnlockResult =
    | { ok: true; salt: string }
    | { ok: false; error: string };

/**
 * Derive the vault key and prove the passphrase against every sealed payload
 * before unlocking. A fresh salt is created when none exists (or the existing
 * one is unusable); an existing unusable salt therefore fails its proof and
 * the vault stays locked rather than crashing.
 */
export async function openVault(
    passphrase: string,
    existingSalt: string | null,
    sealed: Record<string, string>,
): Promise<VaultUnlockResult> {
    // Start clean: a previous session's key must never leak into this attempt.
    lockVault();

    let saltBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    if (existingSalt) {
        try {
            const decoded = base64ToBytes(existingSalt);
            if (decoded.length >= SALT_BYTES) saltBytes = decoded;
        } catch {
            // Unusable salt: keep the fresh one and let the proof fail.
        }
    }

    let key: CryptoKey;
    try {
        key = await deriveVaultKey(passphrase, saltBytes);
    } catch {
        return { ok: false, error: 'The key vault could not be opened in this browser.' };
    }

    for (const [id, payload] of Object.entries(sealed)) {
        try {
            inMemoryKeys.set(id, await openCredential(key, payload));
        } catch {
            inMemoryKeys.clear();
            return { ok: false, error: 'Incorrect passphrase — the vault stays locked.' };
        }
    }

    vaultKey = key;
    vaultSalt = saltBytes;
    return { ok: true, salt: bytesToBase64(saltBytes) };
}

/**
 * Seal a plaintext credential under the unlocked vault key as a versioned
 * envelope. Returns null while the vault is locked — callers must never
 * write ciphertext they cannot decrypt again, and the plaintext stays in
 * module memory only.
 */
export async function sealIntoVault(id: string, plaintext: string): Promise<string | null> {
    if (!vaultKey || !vaultSalt) return null;

    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const encrypted = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as unknown as BufferSource },
            vaultKey,
            encoder.encode(plaintext) as unknown as BufferSource,
        ),
    );
    const envelope: CredentialEnvelope = {
        version: 1,
        kdf: {
            algorithm: 'PBKDF2',
            hash: 'SHA-256',
            iterations: PBKDF2_ITERATIONS,
            salt: bytesToBase64(vaultSalt),
        },
        cipher: { algorithm: 'AES-GCM', iv: bytesToBase64(iv) },
        ciphertext: bytesToBase64(encrypted),
    };

    inMemoryKeys.set(id, plaintext);
    return serializeEnvelope(envelope);
}

export const revealFromVault = (id: string): string | undefined => inMemoryKeys.get(id);

export const forgetInVault = (id: string): void => {
    inMemoryKeys.delete(id);
};

/** Lock the vault: the derived key, the salt, and all plaintexts vanish. */
export function lockVault(): void {
    vaultKey = null;
    vaultSalt = null;
    inMemoryKeys.clear();
}

interface VaultStorageTarget {
    addEventListener(type: 'storage', listener: (event: { key: string | null }) => void): void;
    removeEventListener(type: 'storage', listener: (event: { key: string | null }) => void): void;
}

/**
 * Cross-tab invalidation: when another tab rewrites the persisted settings
 * payload, this tab's in-memory plaintexts may be stale — the observer lets
 * the owner lock the vault in response.
 */
export function observeVaultStorage(
    target: VaultStorageTarget,
    storageKey: string,
    onExternalWrite: () => void,
): () => void {
    const handler = (event: { key: string | null }) => {
        if (event.key === storageKey) onExternalWrite();
    };
    target.addEventListener('storage', handler);
    return () => target.removeEventListener('storage', handler);
}
