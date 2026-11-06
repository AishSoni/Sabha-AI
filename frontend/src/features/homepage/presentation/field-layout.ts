import type { EmblemId } from "./emblems";

export type FieldDensity = "wide" | "medium" | "compact";

export interface FieldSlot {
  readonly id: string;
  readonly emblemId: EmblemId;
  readonly angle: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly speed: number;
  readonly direction: 1 | -1;
  readonly size: number;
  readonly depth: number;
  readonly opacity: number;
  readonly rotation: number;
  readonly medium: boolean;
  readonly compact: boolean;
}

const FIELD_CENTER_X = 50;
const FIELD_CENTER_Y = 48;

const SLOT_SOURCE = [
  ["slot-01", "prism", 5, 56, 45, 92, 0.9, 0.9, 0.012, 1, 6, true, true],
  ["slot-02", "orbit", 25, 52, 43, 70, 0.62, 0.75, 0.01, -1, -4, true, false],
  ["slot-03", "ledger", 45, 47, 39, 54, 0.42, 0.55, 0.014, 1, 8, true, false],
  ["slot-04", "compass", 65, 54, 46, 84, 0.8, 0.85, 0.009, -1, -7, true, true],
  ["slot-05", "wave", 85, 49, 42, 62, 0.5, 0.65, 0.013, 1, 3, true, false],
  ["slot-06", "quadrant", 105, 56, 48, 100, 0.95, 0.9, 0.008, -1, -5, true, true],
  ["slot-07", "lens", 125, 50, 41, 58, 0.45, 0.6, 0.012, 1, 6, true, false],
  ["slot-08", "seed", 145, 46, 37, 48, 0.3, 0.45, 0.016, -1, -3, false, false],
  ["slot-09", "prism", 165, 55, 44, 88, 0.84, 0.85, 0.009, 1, 5, true, true],
  ["slot-10", "orbit", 185, 51, 41, 66, 0.56, 0.7, 0.011, -1, -6, true, false],
  ["slot-11", "ledger", 205, 48, 38, 52, 0.38, 0.5, 0.015, 1, 4, false, false],
  ["slot-12", "compass", 225, 56, 46, 96, 0.92, 0.9, 0.008, -1, -8, true, true],
  ["slot-13", "wave", 245, 50, 42, 64, 0.52, 0.68, 0.012, 1, 7, true, false],
  ["slot-14", "quadrant", 265, 45, 35, 44, 0.25, 0.4, 0.018, -1, -4, false, false],
  ["slot-15", "lens", 285, 54, 45, 86, 0.8, 0.84, 0.01, 1, 5, true, true],
  ["slot-16", "seed", 305, 49, 40, 60, 0.48, 0.62, 0.013, -1, -5, true, false],
  ["slot-17", "prism", 325, 43, 33, 40, 0.2, 0.35, 0.019, 1, 3, false, false],
  ["slot-18", "orbit", 345, 53, 43, 80, 0.75, 0.8, 0.01, -1, -6, true, true],
] as const;

export const HOME_FIELD_SLOTS: readonly FieldSlot[] = SLOT_SOURCE.map(
  ([
    id,
    emblemId,
    angle,
    radiusX,
    radiusY,
    size,
    depth,
    opacity,
    speed,
    direction,
    rotation,
    medium,
    compact,
  ]) => ({
    id,
    emblemId,
    angle,
    radiusX,
    radiusY,
    size,
    depth,
    opacity,
    speed,
    direction,
    rotation,
    medium,
    compact,
  }),
);

export const HOME_FIELD_SLOTS_BY_DENSITY: Record<
  FieldDensity,
  readonly FieldSlot[]
> = {
  wide: HOME_FIELD_SLOTS,
  medium: HOME_FIELD_SLOTS.filter((slot) => slot.medium),
  compact: HOME_FIELD_SLOTS.filter((slot) => slot.compact),
};

export function resolveFieldSlot(slot: FieldSlot, elapsedSeconds = 0) {
  const angle =
    (slot.angle * Math.PI) / 180 +
    elapsedSeconds * slot.speed * slot.direction;
  const x = FIELD_CENTER_X + slot.radiusX * Math.cos(angle);
  const y = FIELD_CENTER_Y + slot.radiusY * Math.sin(angle);
  const dx = -slot.radiusX * Math.sin(angle);
  const dy = slot.radiusY * Math.cos(angle);
  const tangent = Math.atan2(dy, dx) - Math.PI / 2;
  const rotation = tangent + (slot.rotation * Math.PI) / 180;

  return {
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3)),
    rotation: Number(rotation.toFixed(3)),
  };
}
