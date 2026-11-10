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
        fieldA: "#4c1d95",
        fieldB: "#7c3aed",
        ink: "#f8f3ff",
        muted: "#cbbce8",
        accent: "#c4b5fd",
        line: "#e9ddff",
        card: "#140b24",
        border: "#c4b5fd",
    },
    {
        base: "#030817",
        fieldA: "#1e40af",
        fieldB: "#0e7490",
        ink: "#f2f7ff",
        muted: "#b8c8e8",
        accent: "#93c5fd",
        line: "#dbeafe",
        card: "#08142c",
        border: "#93c5fd",
    },
    {
        base: "#160610",
        fieldA: "#9f1239",
        fieldB: "#be185d",
        ink: "#fff6f9",
        muted: "#e6bdcd",
        accent: "#f9a8d4",
        line: "#ffe1ee",
        card: "#240a17",
        border: "#f9a8d4",
    },
    {
        base: "#140a04",
        fieldA: "#92400e",
        fieldB: "#6d28d9",
        ink: "#fff8ee",
        muted: "#e4cbb4",
        accent: "#fcd34d",
        line: "#fff0c2",
        card: "#211208",
        border: "#fcd34d",
    },
] as const;

const LIGHT: readonly IntroPalette[] = [
    {
        base: "#eadfff",
        fieldA: "#c4b5fd",
        fieldB: "#a78bfa",
        ink: "#241536",
        muted: "#5b4b76",
        accent: "#6d28d9",
        line: "#6d28d9",
        card: "#ffffff",
        border: "#6d28d9",
    },
    {
        base: "#e3edff",
        fieldA: "#bfdbfe",
        fieldB: "#93c5fd",
        ink: "#101d36",
        muted: "#4b5e7e",
        accent: "#1d4ed8",
        line: "#a5b4fc",
        card: "#ffffff",
        border: "#1d4ed8",
    },
    {
        base: "#ffeef5",
        fieldA: "#fbcfe8",
        fieldB: "#f9a8d4",
        ink: "#35101f",
        muted: "#7a4a5d",
        accent: "#be185d",
        line: "#db2777",
        card: "#ffffff",
        border: "#be185d",
    },
    {
        base: "#fff5e6",
        fieldA: "#fde68a",
        fieldB: "#d8b4fe",
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
