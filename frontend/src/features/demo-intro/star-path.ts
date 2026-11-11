import { INTRO_MAX_PROGRESS } from "./scene-config";

/**
 * The comet's route through the introduction.
 *
 * `u` runs across the viewport (0 = left edge) and `v` runs down it (0 = top
 * edge), so the drawn shape survives any window size. `depth` is the distance
 * in world units in front of the camera, which tilts the route through space:
 * the star swells as it swings over the headline, dips behind the loop, and
 * settles at the lower right instead of sliding along a flat plane.
 */
export interface StarPathSample {
    u: number;
    v: number;
    depth: number;
}

interface PathKey {
    u: number;
    v: number;
    depth: number;
}

/** Horizontal screen units weigh more than vertical ones when pacing. */
const HORIZONTAL_WEIGHT = 1.85;
const SEGMENT_STEPS = 32;

const LOOP_CENTER_U = 0.628;
const LOOP_CENTER_V = 0.508;
const LOOP_RADIUS_U = 0.045;
const LOOP_RADIUS_V = 0.066;
const LOOP_DEPTH = 10.2;
/** Tilts the ring in depth so the loop reads as a 3D orbit. */
const LOOP_TILT = 1.2;
const LOOP_STEPS = 32;

/** Start at the lower left, climb the left edge, and arc over the headline. */
const ASCENT: readonly PathKey[] = [
    { u: 0.196, v: 0.922, depth: 12.6 },
    { u: 0.193, v: 0.8, depth: 11.85 },
    { u: 0.202, v: 0.665, depth: 11.05 },
    { u: 0.236, v: 0.525, depth: 10.2 },
    { u: 0.298, v: 0.392, depth: 9.5 },
    { u: 0.384, v: 0.285, depth: 9.0 },
    { u: 0.482, v: 0.205, depth: 8.75 },
    { u: 0.575, v: 0.15, depth: 8.7 },
    { u: 0.632, v: 0.158, depth: 8.85 },
    { u: 0.673, v: 0.205, depth: 9.1 },
    { u: 0.69, v: 0.285, depth: 9.5 },
    { u: 0.688, v: 0.372, depth: 9.98 },
    { u: 0.674, v: 0.462, depth: 10.25 },
];

/** Drop off the right of the arc into a full loop, then run out to the end. */
const EXIT: readonly PathKey[] = [
    { u: 0.69, v: 0.556, depth: 10.1 },
    { u: 0.718, v: 0.618, depth: 10.3 },
    { u: 0.754, v: 0.676, depth: 10.5 },
    { u: 0.795, v: 0.73, depth: 10.65 },
    { u: 0.834, v: 0.78, depth: 10.85 },
    { u: 0.868, v: 0.822, depth: 11.0 },
];

function loopKeys(): PathKey[] {
    const keys: PathKey[] = [];
    for (let step = 0; step < LOOP_STEPS; step += 1) {
        const angle = (step / LOOP_STEPS) * Math.PI * 2;
        keys.push({
            u: LOOP_CENTER_U + Math.cos(angle) * LOOP_RADIUS_U,
            v: LOOP_CENTER_V + Math.sin(angle) * LOOP_RADIUS_V,
            depth: LOOP_DEPTH + Math.sin(angle) * LOOP_TILT,
        });
    }
    return keys;
}

const PATH_KEYS: readonly PathKey[] = [...ASCENT, ...loopKeys(), ...EXIT];

function lerpPoint(from: PathKey, to: PathKey, t: number): PathKey {
    return {
        u: from.u + (to.u - from.u) * t,
        v: from.v + (to.v - from.v) * t,
        depth: from.depth + (to.depth - from.depth) * t,
    };
}

function chord(p0: PathKey, p1: PathKey): number {
    const du = (p1.u - p0.u) * HORIZONTAL_WEIGHT;
    const dv = p1.v - p0.v;
    return Math.pow(Math.max(Math.hypot(du, dv), 1e-4), 0.5);
}

/**
 * Centripetal catmull-rom segment. Knots come from the on-screen chord, so the
 * sparse opening keys and the dense loop keys join without overshoot.
 */
function sampleSegment(
    p0: PathKey,
    p1: PathKey,
    p2: PathKey,
    p3: PathKey,
    s: number
): PathKey {
    const t0 = 0;
    const t1 = t0 + chord(p0, p1);
    const t2 = t1 + chord(p1, p2);
    const t3 = t2 + chord(p2, p3);
    const t = t1 + (t2 - t1) * s;

    const a1 = lerpPoint(p0, p1, (t - t0) / (t1 - t0));
    const a2 = lerpPoint(p1, p2, (t - t1) / (t2 - t1));
    const a3 = lerpPoint(p2, p3, (t - t2) / (t3 - t2));
    const b1 = lerpPoint(a1, a2, (t - t0) / (t2 - t0));
    const b2 = lerpPoint(a2, a3, (t - t1) / (t3 - t1));
    return lerpPoint(b1, b2, (t - t1) / (t2 - t1));
}

function buildSamples(): StarPathSample[] {
    const samples: StarPathSample[] = [];
    for (let index = 0; index < PATH_KEYS.length - 1; index += 1) {
        const p0 = PATH_KEYS[Math.max(0, index - 1)]!;
        const p1 = PATH_KEYS[index]!;
        const p2 = PATH_KEYS[index + 1]!;
        const p3 = PATH_KEYS[Math.min(PATH_KEYS.length - 1, index + 2)]!;
        for (let step = 0; step < SEGMENT_STEPS; step += 1) {
            samples.push(sampleSegment(p0, p1, p2, p3, step / SEGMENT_STEPS));
        }
    }
    const last = PATH_KEYS[PATH_KEYS.length - 1]!;
    samples.push({ u: last.u, v: last.v, depth: last.depth });
    return samples;
}

const PATH_SAMPLES = buildSamples();

/** Cumulative on-screen arc length, used to keep the comet's speed constant. */
const PATH_DISTANCE: number[] = [0];
for (let index = 1; index < PATH_SAMPLES.length; index += 1) {
    const previous = PATH_SAMPLES[index - 1]!;
    const current = PATH_SAMPLES[index]!;
    const du = (current.u - previous.u) * HORIZONTAL_WEIGHT;
    const dv = current.v - previous.v;
    PATH_DISTANCE.push(
        PATH_DISTANCE[index - 1]! + Math.hypot(du, dv)
    );
}

const PATH_LENGTH = PATH_DISTANCE[PATH_DISTANCE.length - 1]!;

/**
 * Samples the route for a journey position in `0..INTRO_MAX_PROGRESS`.
 * Positions outside the range clamp to the two ends.
 */
export function starPathAt(progress: number): StarPathSample {
    const clamped = Math.min(Math.max(progress, 0), INTRO_MAX_PROGRESS);
    const target = (clamped / INTRO_MAX_PROGRESS) * PATH_LENGTH;

    let low = 0;
    let high = PATH_DISTANCE.length - 1;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (PATH_DISTANCE[middle]! < target) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    const upperIndex = low;
    const lowerIndex = Math.max(0, upperIndex - 1);
    const span = PATH_DISTANCE[upperIndex]! - PATH_DISTANCE[lowerIndex]!;
    const t = span <= 0 ? 0 : (target - PATH_DISTANCE[lowerIndex]!) / span;
    const lower = PATH_SAMPLES[lowerIndex]!;
    const upper = PATH_SAMPLES[upperIndex]!;
    return {
        u: lower.u + (upper.u - lower.u) * t,
        v: lower.v + (upper.v - lower.v) * t,
        depth: lower.depth + (upper.depth - lower.depth) * t,
    };
}
