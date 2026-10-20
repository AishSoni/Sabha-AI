/**
 * Contract for the credential envelope format (spec-05, shared credentials).
 *
 * The envelope is the self-describing, versioned persistence format for a
 * sealed provider key. It must fail safe: anything malformed, downgraded, or
 * from an unsupported version is rejected as null — never partially trusted,
 * never thrown across the boundary.
 */
import { describe, expect, it } from 'vitest';
import {
    CredentialEnvelope,
    CREDENTIAL_ENVELOPE_VERSION,
    PBKDF2_ITERATIONS,
    base64ToBytes,
    bytesToBase64,
    decodeLegacyPacked,
    parseEnvelope,
    serializeEnvelope,
} from './envelope';

const b64 = (length: number, fill = 1) => {
    const bytes = new Uint8Array(length).fill(fill);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
};

const validEnvelope = (): CredentialEnvelope => ({
    version: CREDENTIAL_ENVELOPE_VERSION,
    kdf: {
        algorithm: 'PBKDF2',
        hash: 'SHA-256',
        iterations: PBKDF2_ITERATIONS,
        salt: b64(16),
    },
    cipher: { algorithm: 'AES-GCM', iv: b64(12, 2) },
    ciphertext: b64(32, 3),
});

describe('credential envelope parsing', () => {
    it('accepts a structurally valid envelope', () => {
        const envelope = validEnvelope();
        expect(parseEnvelope(serializeEnvelope(envelope))).toEqual(envelope);
    });

    it('rejects envelopes from a newer or unknown version', () => {
        // Deliberately malformed input: a version the format does not support.
        const future = { ...validEnvelope(), version: CREDENTIAL_ENVELOPE_VERSION + 1 } as unknown as CredentialEnvelope;
        expect(parseEnvelope(serializeEnvelope(future))).toBeNull();
    });

    it('rejects a salt shorter than 16 bytes', () => {
        const envelope = validEnvelope();
        envelope.kdf.salt = b64(15);
        expect(parseEnvelope(serializeEnvelope(envelope))).toBeNull();
    });

    it('rejects an IV shorter than 96 bits', () => {
        const envelope = validEnvelope();
        envelope.cipher.iv = b64(11, 2);
        expect(parseEnvelope(serializeEnvelope(envelope))).toBeNull();
    });

    it('rejects unknown or downgraded KDF parameters', () => {
        const weakKdf = validEnvelope();
        weakKdf.kdf.iterations = 1000;
        expect(parseEnvelope(serializeEnvelope(weakKdf))).toBeNull();

        const otherHash = validEnvelope();
        (otherHash.kdf as { hash: string }).hash = 'SHA-1';
        expect(parseEnvelope(serializeEnvelope(otherHash))).toBeNull();

        const otherCipher = validEnvelope();
        (otherCipher.cipher as { algorithm: string }).algorithm = 'AES-CBC';
        expect(parseEnvelope(serializeEnvelope(otherCipher))).toBeNull();
    });

    it('rejects malformed payloads without throwing', () => {
        expect(parseEnvelope('not json at all')).toBeNull();
        expect(parseEnvelope('null')).toBeNull();
        expect(parseEnvelope('[]')).toBeNull();
        expect(parseEnvelope('{"version":1}')).toBeNull();
    });

    it('round-trips through serialize', () => {
        const envelope = validEnvelope();
        const parsed = parseEnvelope(serializeEnvelope(envelope));
        expect(parsed).toEqual(envelope);
        expect(parsed?.version).toBe(1);
    });
});

describe('legacy packed payload decoding', () => {
    it('splits the old iv+ciphertext blob into bytes', () => {
        const iv = new Uint8Array(12).fill(7);
        const payload = new Uint8Array(5).fill(9);
        const packed = new Uint8Array(iv.length + payload.length);
        packed.set(iv, 0);
        packed.set(payload, iv.length);

        const decoded = decodeLegacyPacked(bytesToBase64(packed));
        expect(Array.from(decoded?.iv ?? [])).toEqual(Array.from(iv));
        expect(Array.from(decoded?.ciphertext ?? [])).toEqual(Array.from(payload));
    });

    it('rejects payloads too short to carry an IV', () => {
        expect(decodeLegacyPacked(bytesToBase64(new Uint8Array(11)))).toBeNull();
    });

    it('rejects non-base64 junk without throwing', () => {
        expect(decodeLegacyPacked('!!! not base64 !!!')).toBeNull();
    });
});

describe('base64 helpers', () => {
    it('round-trips bytes through base64', () => {
        const bytes = base64ToBytes(b64(16, 5));
        expect(bytes).toHaveLength(16);
        expect(bytes[0]).toBe(5);
    });
});
