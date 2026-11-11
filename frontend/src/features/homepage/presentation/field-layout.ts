export type FieldDensity = "wide" | "medium" | "compact";

/**
 * Resolution cap for the hero canvas. The compact breakpoint lowers the
 * backing store so phones do not pay for an unnecessary fill rate.
 */
export function fieldDprCap(viewportWidth: number): number {
  return viewportWidth < 768 ? 1.5 : 2;
}

export {
  HOME_FIELD_SLOTS,
  HOME_FIELD_SLOTS_BY_DENSITY,
  type FieldSlot,
} from "./spiral";

/**
 * Static slots already carry their authored position. Kept as a small adapter
 * for callers that only need the position/rotation pair.
 */
export function resolveFieldSlot(slot: {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}): { x: number; y: number; rotation: number } {
  return {
    x: slot.x,
    y: slot.y,
    rotation: slot.rotation,
  };
}
