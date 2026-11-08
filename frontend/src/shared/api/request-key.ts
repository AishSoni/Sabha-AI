/**
 * One request identity for one deliberate command.
 *
 * Web Crypto is preferred; the fallback exists only for old/insecure
 * embeddings where `randomUUID` is unavailable.
 */
export function createRequestKey(prefix = 'request'): string {
    const withCrypto = globalThis.crypto as Crypto | undefined;
    if (withCrypto && typeof withCrypto.randomUUID === 'function') {
        return withCrypto.randomUUID();
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
