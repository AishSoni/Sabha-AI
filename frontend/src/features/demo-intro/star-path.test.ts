import { describe, expect, it } from "vitest";
import { INTRO_MAX_PROGRESS } from "./scene-config";
import { starPathAt } from "./star-path";

const HORIZONTAL_WEIGHT = 1.85;

function screenDistance(
    from: { u: number; v: number },
    to: { u: number; v: number }
): number {
    return Math.hypot(
        (to.u - from.u) * HORIZONTAL_WEIGHT,
        to.v - from.v
    );
}

describe("pre-demo comet route", () => {
    it("starts at the lower left and finishes at the lower right", () => {
        const start = starPathAt(0);
        expect(start.u).toBeCloseTo(0.196, 2);
        expect(start.v).toBeCloseTo(0.923, 2);

        const end = starPathAt(INTRO_MAX_PROGRESS);
        expect(end.u).toBeCloseTo(0.868, 2);
        expect(end.v).toBeCloseTo(0.822, 2);
    });

    it("clamps journey positions outside the route", () => {
        expect(starPathAt(-4)).toEqual(starPathAt(0));
        expect(starPathAt(9)).toEqual(starPathAt(INTRO_MAX_PROGRESS));
    });

    it("keeps the route on screen and in front of the camera", () => {
        for (let step = 0; step <= 300; step += 1) {
            const sample = starPathAt((step / 300) * INTRO_MAX_PROGRESS);
            expect(sample.u).toBeGreaterThan(0.15);
            expect(sample.u).toBeLessThan(0.9);
            expect(sample.v).toBeGreaterThan(0.1);
            expect(sample.v).toBeLessThan(0.94);
            expect(sample.depth).toBeGreaterThan(8.5);
            expect(sample.depth).toBeLessThan(13);
        }
    });

    it("moves at a near-constant on-screen speed", () => {
        const strides: number[] = [];
        let previous = starPathAt(0);
        for (let step = 1; step <= 300; step += 1) {
            const next = starPathAt((step / 300) * INTRO_MAX_PROGRESS);
            strides.push(screenDistance(previous, next));
            previous = next;
        }
        expect(Math.max(...strides) / Math.min(...strides)).toBeLessThan(1.05);
    });

    it("turns through a full loop on the way down", () => {
        let turning = 0;
        let previousAngle: number | null = null;
        let previous = starPathAt(1.85);
        for (let step = 1; step <= 300; step += 1) {
            const next = starPathAt(1.85 + (step / 300) * 0.7);
            const angle = Math.atan2(
                next.v - previous.v,
                (next.u - previous.u) * HORIZONTAL_WEIGHT
            );
            if (previousAngle !== null) {
                let delta = angle - previousAngle;
                while (delta > Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                turning += delta;
            }
            previousAngle = angle;
            previous = next;
        }
        expect(Math.abs(turning)).toBeGreaterThan(Math.PI * 1.5);
    });
});
