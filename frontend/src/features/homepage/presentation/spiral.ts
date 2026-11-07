import { EMBLEMS, type EmblemId } from "./emblems";

export const SPIRAL_TURNS = 8;
export const SPIRAL_CAMERA_SIZE = 2500;
export const SPIRAL_STAGE_MIN_SIZE = 2000;
export const SPIRAL_RADIUS = 0.75 * SPIRAL_CAMERA_SIZE;
export const SPIRAL_SPACING = 1;
export const SPIRAL_SPREAD = 0.95;
export const SPIRAL_SIZE_ATTENUATION = 0.35;
export const SPIRAL_FADE_IN = 8;
export const SPIRAL_FADE_OUT = 8;

const SPIRAL_INTEGRATION_STEPS = 16384;
const SPIRAL_RESAMPLE_STEPS = 4096;

export interface SpiralSample {
  readonly x: number;
  readonly y: number;
  readonly tx: number;
  readonly ty: number;
}

export interface CardSize {
  readonly width: number;
  readonly height: number;
}

export interface CardScene {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly fade: number;
  readonly scale: number;
}

// Cosmos authors these as half-extents; our quad uses full extents, so the
// authored tiers are doubled to keep the same on-screen card mass.
const SIZE_TIERS: readonly CardSize[] = [
  { width: 112, height: 144 },
  { width: 144, height: 192 },
  { width: 160, height: 240 },
];

function buildSpiralSamples(): readonly SpiralSample[] {
  const points: { x: number; y: number }[] = [];
  const cumulative: number[] = [0];

  for (let index = 0; index <= SPIRAL_INTEGRATION_STEPS; index += 1) {
    const progress = index / SPIRAL_INTEGRATION_STEPS;
    const angle = progress * SPIRAL_TURNS * Math.PI * 2;
    const radius = SPIRAL_RADIUS * (1 - progress);
    const x = radius * Math.cos(angle);
    const y = -radius * Math.sin(angle);
    points.push({ x, y });
    if (index > 0) {
      const previous = points[index - 1]!;
      cumulative.push(
        cumulative[index - 1]! +
          Math.hypot(x - previous.x, y - previous.y),
      );
    }
  }

  const total = cumulative[cumulative.length - 1] ?? 1;
  const resampled: SpiralSample[] = [];
  let cursor = 0;

  for (let index = 0; index < SPIRAL_RESAMPLE_STEPS; index += 1) {
    const target = (index / (SPIRAL_RESAMPLE_STEPS - 1)) * total;
    while (
      cursor < cumulative.length - 2 &&
      cumulative[cursor + 1]! < target
    ) {
      cursor += 1;
    }
    const start = cumulative[cursor] ?? 0;
    const end = cumulative[cursor + 1] ?? start;
    const fraction = end === start ? 0 : (target - start) / (end - start);
    const from = points[cursor]!;
    const to = points[cursor + 1] ?? from;
    const x = from.x + (to.x - from.x) * fraction;
    const y = from.y + (to.y - from.y) * fraction;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    resampled.push({ x, y, tx: dx / length, ty: dy / length });
  }

  return resampled;
}

const SAMPLES = buildSpiralSamples();
const TOTAL_LENGTH = (() => {
  let length = 0;
  for (let index = 1; index < SAMPLES.length; index += 1) {
    const previous = SAMPLES[index - 1]!;
    const current = SAMPLES[index]!;
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
})();

export const SPIRAL_LENGTH = TOTAL_LENGTH;
export const SPIRAL_CARD_COUNT = Math.max(
  10,
  Math.ceil(TOTAL_LENGTH / 250),
);

export function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function sampleSpiral(percent: number): SpiralSample {
  const wrapped = positiveModulo(percent, 100) / 100;
  const position = wrapped * (SAMPLES.length - 1);
  const index = Math.floor(position);
  const fraction = position - index;
  const from = SAMPLES[index]!;
  const to = SAMPLES[Math.min(index + 1, SAMPLES.length - 1)]!;

  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
    tx: from.tx + (to.tx - from.tx) * fraction,
    ty: from.ty + (to.ty - from.ty) * fraction,
  };
}

export function cardSizeAt(index: number): CardSize {
  return SIZE_TIERS[index % SIZE_TIERS.length]!;
}

export function cardSceneAt(
  index: number,
  count: number,
  offsetPercent: number,
): CardScene {
  const positionPercent =
    (index / Math.max(count, 1) - 0.5) * 100 * SPIRAL_SPACING;
  const percent = positiveModulo(offsetPercent + positionPercent, 100);
  const sample = sampleSpiral(percent);

  let x = sample.x;
  let y = sample.y;
  const distance = Math.hypot(x, y);
  if (distance > 0) {
    const remapped =
      (SPIRAL_RADIUS * (distance / SPIRAL_RADIUS) ** (1 / SPIRAL_SPREAD)) /
      distance;
    x *= remapped;
    y *= remapped;
  }

  const fade =
    percent < SPIRAL_FADE_IN
      ? percent / SPIRAL_FADE_IN
      : percent > 100 - SPIRAL_FADE_OUT
        ? (100 - percent) / SPIRAL_FADE_OUT
        : 1;
  const scale =
    Math.min(Math.hypot(x, y) / SPIRAL_RADIUS, 1) **
    SPIRAL_SIZE_ATTENUATION;

  return {
    x,
    y,
    angle: Math.atan2(sample.ty, sample.tx),
    fade,
    scale,
  };
}

export interface FieldSlot {
  readonly id: string;
  readonly emblemId: EmblemId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly opacity: number;
}

export const HOME_FIELD_SLOTS: readonly FieldSlot[] = Array.from(
  { length: SPIRAL_CARD_COUNT },
  (_, index) => {
    const scene = cardSceneAt(index, SPIRAL_CARD_COUNT, 0);
    const size = cardSizeAt(index);
    const emblem = EMBLEMS[index % EMBLEMS.length]!;
    return {
      id: `persona-slot-${String(index + 1).padStart(3, "0")}`,
      emblemId: emblem.id,
      x: Number((50 + (scene.x / SPIRAL_CAMERA_SIZE) * 100).toFixed(4)),
      y: Number((50 + (scene.y / SPIRAL_CAMERA_SIZE) * 100).toFixed(4)),
      width: Number(
        (((size.width * scene.scale) / SPIRAL_CAMERA_SIZE) * 100).toFixed(4),
      ),
      height: Number(
        (((size.height * scene.scale) / SPIRAL_CAMERA_SIZE) * 100).toFixed(4),
      ),
      rotation: Number(scene.angle.toFixed(4)),
      opacity: Number((scene.fade * (0.86 + scene.scale * 0.14)).toFixed(3)),
    };
  },
);

export const HOME_FIELD_SLOTS_BY_DENSITY: Record<
  "wide" | "medium" | "compact",
  readonly FieldSlot[]
> = {
  wide: HOME_FIELD_SLOTS,
  medium: HOME_FIELD_SLOTS,
  compact: HOME_FIELD_SLOTS,
};
