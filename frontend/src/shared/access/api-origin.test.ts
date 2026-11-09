import { describe, expect, it } from 'vitest';

import { describeApiOrigin, isLoopbackHost } from './api-origin';

describe('API origin diagnosis', () => {
    it('accepts the local default on a local page', () => {
        const diagnosis = describeApiOrigin(undefined, 'http://localhost:3000');

        expect(diagnosis).toMatchObject({
            source: 'local-default',
            page: 'local',
            issue: null,
        });
    });

    it('rejects a missing API origin on a hosted page', () => {
        const diagnosis = describeApiOrigin('', 'https://sabha.example');

        expect(diagnosis.source).toBe('local-default');
        expect(diagnosis.page).toBe('hosted');
        expect(diagnosis.issue).toBe('loopback-api-on-hosted');
        expect(diagnosis.detail).toContain('NEXT_PUBLIC_API_URL is not set');
        expect(diagnosis.remediation).toContain('public HTTPS API origin');
    });

    it('rejects an explicitly loopback API origin on a hosted page', () => {
        const diagnosis = describeApiOrigin(
            'http://127.0.0.1:8000/api',
            'https://sabha.example',
        );

        expect(diagnosis).toMatchObject({
            source: 'configured',
            page: 'hosted',
            issue: 'loopback-api-on-hosted',
        });
        expect(diagnosis.detail).toContain('points at a loopback address');
    });

    it('accepts a configured public origin on a hosted page', () => {
        const diagnosis = describeApiOrigin(
            'https://api.sabha.example/api',
            'https://sabha.example',
        );

        expect(diagnosis).toMatchObject({
            source: 'configured',
            page: 'hosted',
            issue: null,
        });
    });

    it('does not judge an origin during server rendering', () => {
        const diagnosis = describeApiOrigin(undefined, null);

        expect(diagnosis).toMatchObject({
            source: 'local-default',
            page: 'unknown',
            issue: null,
        });
    });

    it('recognizes IPv4, IPv6 and localhost loopback hosts', () => {
        expect(isLoopbackHost('localhost')).toBe(true);
        expect(isLoopbackHost('127.0.0.1')).toBe(true);
        expect(isLoopbackHost('[::1]')).toBe(true);
        expect(isLoopbackHost('::1')).toBe(true);
        expect(isLoopbackHost('api.sabha.example')).toBe(false);
    });
});
