import { describe, expect, it } from 'vitest';

import { DEFAULT_RETURN_TARGET, loginHref, safeReturnTarget } from './return-target';

describe('safe login return targets', () => {
    it('preserves same-origin live paths with their query', () => {
        expect(safeReturnTarget('/meetings/abc?tab=turns')).toBe(
            '/meetings/abc?tab=turns'
        );
        expect(safeReturnTarget('/settings')).toBe('/settings');
        expect(safeReturnTarget('/knowledge-stacks/1')).toBe('/knowledge-stacks/1');
    });

    it('rejects absolute, protocol-relative, external and replay targets', () => {
        for (const value of [
            'https://evil.example/meetings',
            '//evil.example/meetings',
            '/\\evil.example/meetings',
            '/demo',
            '/health',
            '/meetings/../../demo',
            '',
            null,
        ]) {
            expect(safeReturnTarget(value), String(value)).toBe(DEFAULT_RETURN_TARGET);
        }
    });

    it('builds an encoded login URL from the validated target', () => {
        expect(loginHref('https://evil.example/meetings')).toBe(
            '/login?next=%2Fmeetings'
        );
    });
});
