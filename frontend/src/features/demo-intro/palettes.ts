export interface IntroPalette {
    base: string;
    fieldA: string;
    fieldB: string;
    ink: string;
    muted: string;
    accent: string;
    line: string;
    card: string;
    border: string;
}

const DARK: readonly IntroPalette[] = [
    {
        base: "#07040f",
        fieldA: "#7c3aed",
        fieldB: "#a855f7",
        ink: "#fbf7ff",
        muted: "#ded2f2",
        accent: "#e4d9ff",
        line: "#f7f0ff",
        card: "#190d2e",
        border: "#d8b4fe",
    },
    {
        base: "#030817",
        fieldA: "#2563eb",
        fieldB: "#0891b2",
        ink: "#f5f9ff",
        muted: "#c7d7ef",
        accent: "#bfdbfe",
        line: "#e7f6ff",
        card: "#081a38",
        border: "#93c5fd",
    },
    {
        base: "#160610",
        fieldA: "#be185d",
        fieldB: "#db2777",
        ink: "#fff7fa",
        muted: "#edc6d5",
        accent: "#fbcfe8",
        line: "#ffe7f0",
        card: "#2b0b1d",
        border: "#f9a8d4",
    },
    {
        base: "#140a04",
        fieldA: "#b45309",
        fieldB: "#7c3aed",
        ink: "#fffaf0",
        muted: "#ecd1b8",
        accent: "#fde68a",
        line: "#fff8d9",
        card: "#291508",
        border: "#fcd34d",
    },
] as const;

const LIGHT: readonly IntroPalette[] = [
    {
        base: "#efe8ff",
        fieldA: "#c4b5fd",
        fieldB: "#8b5cf6",
        ink: "#241536",
        muted: "#5b4b76",
        accent: "#6d28d9",
        line: "#6d28d9",
        card: "#ffffff",
        border: "#6d28d9",
    },
    {
        base: "#e4efff",
        fieldA: "#93c5fd",
        fieldB: "#3b82f6",
        ink: "#101d36",
        muted: "#4b5e7e",
        accent: "#1d4ed8",
        line: "#1d4ed8",
        card: "#ffffff",
        border: "#1d4ed8",
    },
    {
        base: "#ffe8f2",
        fieldA: "#f9a8d4",
        fieldB: "#ec4899",
        ink: "#35101f",
        muted: "#7a4a5d",
        accent: "#be185d",
        line: "#be185d",
        card: "#ffffff",
        border: "#be185d",
    },
    {
        base: "#fff0d4",
        fieldA: "#fcd34d",
        fieldB: "#a78bfa",
        ink: "#2d1a0a",
        muted: "#735437",
        accent: "#b45309",
        line: "#b45309",
        card: "#ffffff",
        border: "#b45309",
    },
] as const;

export function introPalettes(dark: boolean): readonly IntroPalette[] {
    return dark ? DARK : LIGHT;
}

export function introPaletteAt(
    index: number,
    dark: boolean
): IntroPalette {
    const palettes = introPalettes(dark);
    const clamped = Math.min(Math.max(Math.round(index), 0), palettes.length - 1);
    return palettes[clamped]!;
}
