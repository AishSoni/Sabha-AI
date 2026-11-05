const DARK_INK = "#0b1423";
const WHITE = "#ffffff";

function parseHex(value: string): [number, number, number] | null {
    const hex = value.trim().replace(/^#/, "");
    if (hex.length === 3) {
        const expanded = hex
            .split("")
            .map((part) => part + part)
            .join("");
        return parseHex(expanded);
    }
    if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) {
        return null;
    }
    return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
    ];
}

function channel(value: number): number {
    const normalized = value / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
    const rgb = parseHex(hex);
    if (!rgb) return null;
    const [r, g, b] = rgb.map(channel);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
    const lighter = Math.max(a, b);
    const darker = Math.min(a, b);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Chooses the higher-contrast foreground for an arbitrary participant color.
 * Participant colors are user data, not theme tokens, so text on a swatch
 * cannot rely on the active appearance.
 */
export function readableTextOn(color: string): string {
    const background = luminance(color);
    if (background === null) return WHITE;
    const white = luminance(WHITE);
    const dark = luminance(DARK_INK);
    if (white === null || dark === null) return WHITE;
    return contrast(background, dark) >= contrast(background, white)
        ? DARK_INK
        : WHITE;
}
