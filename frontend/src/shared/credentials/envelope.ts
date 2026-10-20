/**
 * Credential envelope format (spec-05, shared credentials).
 *
 * The envelope is the self-describing, versioned persistence format for one
 * sealed provider key: which KDF produced the vault key, which cipher sealed
 * the secret, and the raw ciphertext. Only envelopes (ciphertext, salt, IV)
 * may ever be persisted; this module is format-only and holds no key state.
 *
 * Every parse failure is fail-safe: malformed, downgraded, or unsupported
 * payloads parse to null instead of throwing or being partially trusted.
 */

export const CREDENTIAL_ENVELOPE_VERSION = 1;
export const PBKDF2_ITERATIONS = 210_000;

// A vault salt must have at least 128 bits of entropy; a per-secret IV at
// least 96 bits (the AES-GCM recommendation).
const MIN_SALT_BYTES = 16;
const MIN_IV_BYTES = 12;

export interface CredentialEnvelope {
    version: 1;
    kdf: {
        algorithm: 'PBKDF2';
        hash: 'SHA-256';
        iterations: number;
        salt: string; // base64
    };
    cipher: {
        algorithm: 'AES-GCM';
        iv: string; // base64
    };
    ciphertext: string; // base64 (includes the AES-GCM authentication tag)
}

export const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
};

export const base64ToBytes = (b64: string): Uint8Array => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

export const serializeEnvelope = (envelope: CredentialEnvelope): string =>
    JSON.stringify(envelope);

export function parseEnvelope(raw: string): CredentialEnvelope | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return null;
        }

        const candidate = parsed as Partial<CredentialEnvelope> & Record<string, unknown>;
        if (candidate.version !== CREDENTIAL_ENVELOPE_VERSION) return null;

        const kdf = candidate.kdf as CredentialEnvelope['kdf'] | undefined;
        if (typeof kdf !== 'object' || kdf === null) return null;
        if (kdf.algorithm !== 'PBKDF2' || kdf.hash !== 'SHA-256') return null;
        if (
            typeof kdf.iterations !== 'number'
            || !Number.isInteger(kdf.iterations)
            || kdf.iterations < PBKDF2_ITERATIONS
        ) return null;
        if (typeof kdf.salt !== 'string' || base64ToBytes(kdf.salt).length < MIN_SALT_BYTES) {
            return null;
        }

        const cipher = candidate.cipher as CredentialEnvelope['cipher'] | undefined;
        if (typeof cipher !== 'object' || cipher === null) return null;
        if (cipher.algorithm !== 'AES-GCM') return null;
        if (typeof cipher.iv !== 'string' || base64ToBytes(cipher.iv).length < MIN_IV_BYTES) {
            return null;
        }

        if (typeof candidate.ciphertext !== 'string' || candidate.ciphertext.length === 0) {
            return null;
        }
        base64ToBytes(candidate.ciphertext);

        return {
            version: CREDENTIAL_ENVELOPE_VERSION,
            kdf: {
                algorithm: kdf.algorithm,
                hash: kdf.hash,
                iterations: kdf.iterations,
                salt: kdf.salt,
            },
            cipher: { algorithm: cipher.algorithm, iv: cipher.iv },
            ciphertext: candidate.ciphertext,
        };
    } catch {
        return null;
    }
}

export interface LegacyPackedPayload {
    iv: Uint8Array;
    ciphertext: Uint8Array;
}

/**
 * The pre-envelope format packed the per-secret IV and the ciphertext into a
 * single base64 blob with the vault salt stored separately. Kept readable so
 * payloads written before the envelope existed still open.
 */
export function decodeLegacyPacked(raw: string): LegacyPackedPayload | null {
    try {
        const packed = base64ToBytes(raw);
        if (packed.length < MIN_IV_BYTES + 1) return null;
        return {
            iv: packed.slice(0, MIN_IV_BYTES),
            ciphertext: packed.slice(MIN_IV_BYTES),
        };
    } catch {
        return null;
    }
}
