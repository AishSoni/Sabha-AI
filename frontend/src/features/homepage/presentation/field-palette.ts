export type FieldAppearance = "light" | "dark";

export interface FieldPalette {
  readonly appearance: FieldAppearance;
  readonly cardTop: string;
  readonly cardBottom: string;
  readonly glyph: string;
  readonly rim: string;
  readonly glow: string;
  /** CSS-only ambient wash behind the canvas. */
  readonly ambiance: string;
}

/**
 * Both themes keep the persona cards dark violet so the sigils read as one
 * family. Light mode lifts the page around them instead of inverting the cards.
 */
export const FIELD_PALETTES: Record<FieldAppearance, FieldPalette> = {
  dark: {
    appearance: "dark",
    cardTop: "#35205c",
    cardBottom: "#0f081b",
    glyph: "#f7f0ff",
    rim: "#c4b5fd",
    glow: "#7c3aed",
    ambiance:
      "radial-gradient(60% 58% at 50% 46%, rgba(91, 33, 182, 0.28), rgba(9, 5, 18, 0) 70%)",
  },
  light: {
    appearance: "light",
    cardTop: "#4c2a78",
    cardBottom: "#1c0f31",
    glyph: "#ffffff",
    rim: "#e9d5ff",
    glow: "#8b5cf6",
    ambiance:
      "radial-gradient(60% 58% at 50% 46%, rgba(139, 92, 246, 0.16), rgba(247, 244, 252, 0) 72%)",
  },
};
