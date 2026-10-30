/**
 * Login return-target policy (spec-22).
 *
 * Only same-origin paths inside the private namespaces may be preserved.
 * Absolute URLs, protocol-relative URLs, backslashes and arbitrary paths all
 * collapse to the meetings index.
 */

const LIVE_PREFIXES = ['/meetings', '/roster', '/knowledge-stacks', '/settings'];
export const DEFAULT_RETURN_TARGET = '/meetings';

export function safeReturnTarget(
    value: string | null | undefined,
    fallback = DEFAULT_RETURN_TARGET
): string {
    if (!value || !value.startsWith('/') || value.startsWith('//')) {
        return fallback;
    }
    if (value.includes('\\')) {
        return fallback;
    }

    let parsed: URL;
    try {
        parsed = new URL(value, 'https://sabha.invalid');
    } catch {
        return fallback;
    }
    if (parsed.origin !== 'https://sabha.invalid') {
        return fallback;
    }
    const allowed = LIVE_PREFIXES.some(
        (prefix) =>
            parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
    );
    if (!allowed) {
        return fallback;
    }
    return `${parsed.pathname}${parsed.search}`;
}

export function loginHref(target: string): string {
    return `/login?next=${encodeURIComponent(safeReturnTarget(target))}`;
}
