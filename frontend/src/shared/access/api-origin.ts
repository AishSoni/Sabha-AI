/**
 * Pure API-origin diagnosis (spec-38).
 *
 * The live client must not silently send a hosted page's authenticated
 * requests to the visitor's loopback address when NEXT_PUBLIC_API_URL is
 * missing. This module owns the rule and its user-facing explanation; the live
 * transport enforces it before attaching a bearer token.
 */

export type ApiOriginPage = 'local' | 'hosted' | 'unknown';
export type ApiOriginSource = 'configured' | 'local-default';
export type ApiOriginIssue = 'loopback-api-on-hosted';

export interface ApiOriginDiagnosis {
    source: ApiOriginSource;
    page: ApiOriginPage;
    issue: ApiOriginIssue | null;
    detail: string;
    remediation: string;
}

const LOCAL_DEFAULT = 'http://localhost:8000/api';

export function isLoopbackHost(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
    return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function hostOf(origin: string): string | null {
    try {
        return new URL(origin).hostname;
    } catch {
        return null;
    }
}

/**
 * Describe where live requests would go and whether that is legitimate.
 *
 * `configuredValue` is the raw NEXT_PUBLIC_API_URL value (may be empty);
 * `pageOrigin` is the browser origin, or null during server rendering.
 */
export function describeApiOrigin(
    configuredValue: string | undefined,
    pageOrigin: string | null,
): ApiOriginDiagnosis {
    const configured = (configuredValue ?? '').trim();
    const source: ApiOriginSource = configured ? 'configured' : 'local-default';
    const baseHost = hostOf(configured || LOCAL_DEFAULT);
    const pageHost = pageOrigin ? hostOf(pageOrigin) : null;
    const page: ApiOriginPage =
        pageHost === null ? 'unknown' : isLoopbackHost(pageHost) ? 'local' : 'hosted';

    if (page === 'hosted' && baseHost !== null && isLoopbackHost(baseHost)) {
        return {
            source,
            page,
            issue: 'loopback-api-on-hosted',
            detail:
                source === 'local-default'
                    ? 'NEXT_PUBLIC_API_URL is not set, so this hosted page would send live requests to the visitor’s localhost.'
                    : 'NEXT_PUBLIC_API_URL points at a loopback address, so this hosted page would send live requests to the visitor’s localhost.',
            remediation:
                'Set NEXT_PUBLIC_API_URL to the public HTTPS API origin and rebuild the frontend.',
        };
    }

    return { source, page, issue: null, detail: '', remediation: '' };
}
