import { describe, expect, it } from 'vitest';
import {
    isNearScrollBottom,
    SCROLL_STICK_THRESHOLD_PX,
    scrollBehavior,
} from './scroll';

describe('meeting scroll policy', () => {
    it('sticks only when the viewport is near the bottom', () => {
        expect(
            isNearScrollBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 })
        ).toBe(true);
        expect(
            isNearScrollBottom({
                scrollHeight: 1000,
                scrollTop: 300,
                clientHeight: 400,
            })
        ).toBe(false);
    });

    it('honors the threshold at the boundary', () => {
        expect(
            isNearScrollBottom(
                {
                    scrollHeight: 1000,
                    scrollTop: 504,
                    clientHeight: 400,
                },
                SCROLL_STICK_THRESHOLD_PX
            )
        ).toBe(true);
        expect(
            isNearScrollBottom(
                { scrollHeight: 1000, scrollTop: 503, clientHeight: 400 },
                SCROLL_STICK_THRESHOLD_PX
            )
        ).toBe(false);
    });

    it('uses no motion animation when reduced motion is requested', () => {
        expect(scrollBehavior(true)).toBe('auto');
        expect(scrollBehavior(false)).toBe('smooth');
    });
});
