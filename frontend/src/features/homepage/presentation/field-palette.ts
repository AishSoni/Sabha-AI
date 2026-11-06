export type FieldAppearance = "light" | "dark";

export interface FieldPalette {
  readonly ink: string;
  readonly soft: string;
}

export const FIELD_PALETTES: Record<FieldAppearance, FieldPalette> = {
  light: {
    ink: "#294f98",
    soft: "#7b90b4",
  },
  dark: {
    ink: "#a9c7ff",
    soft: "#d5e2fb",
  },
};
