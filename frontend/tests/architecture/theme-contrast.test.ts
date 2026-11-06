import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const tokensPath = path.join(process.cwd(), "src", "styles", "tokens.css");
const css = fs.readFileSync(tokensPath, "utf8");

type Palette = Record<string, string>;

function declarations(block: string): Palette {
  const palette: Palette = {};
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    palette[match[1]] = match[2].trim();
  }
  return palette;
}

function block(selector: RegExp, source = css): string {
  const match = source.match(selector);
  if (!match) {
    throw new Error(`Missing token block ${selector}`);
  }
  return match[1];
}

const light = declarations(block(/:root\s*\{([^}]*)\}/));
const dark = declarations(
  block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/),
);
const darkSystem = declarations(
  block(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/),
);

function hexToRgb(value: string): [number, number, number] {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    throw new Error(`Expected a hex colour, got ${value}`);
  }
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((char) => char + char)
          .join("")
      : match[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function luminance(value: string): number {
  const [r, g, b] = hexToRgb(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

type Rgba = { rgb: [number, number, number]; alpha: number };

function rgba(value: string): Rgba {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    return { rgb: hexToRgb(value), alpha: 1 };
  }
  const match = value
    .trim()
    .match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/i);
  if (!match) {
    throw new Error(`Expected a hex or rgb colour, got ${value}`);
  }
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function blend(top: Rgba, bottom: Rgba): [number, number, number] {
  const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
  return top.rgb.map((channel, index) => {
    const mixed =
      channel * top.alpha +
      bottom.rgb[index] * bottom.alpha * (1 - top.alpha);
    return Math.round(mixed / alpha);
  }) as [number, number, number];
}

function luminanceRgb([r, g, b]: [number, number, number]): number {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRgb(
  foreground: [number, number, number],
  background: [number, number, number],
): number {
  const a = luminanceRgb(foreground);
  const b = luminanceRgb(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

const appearances = [
  ["light", light],
  ["dark (explicit)", dark],
  ["dark (system)", darkSystem],
] as const;

const backgrounds = [
  "canvas",
  "surface",
  "surface-raised",
  "surface-selected",
] as const;

const textRoles = [
  "text-primary",
  "text-secondary",
  "text-muted",
  "accent",
  "success",
  "warning",
  "danger",
] as const;

function expectMinimum(
  palette: Palette,
  foreground: string,
  background: string,
  minimum: number,
) {
  const value = contrast(palette[foreground], palette[background]);
  expect(
    value,
    `${foreground} (${palette[foreground]}) on ${background} (${palette[background]})`,
  ).toBeGreaterThanOrEqual(minimum);
}

describe("semantic palette contrast", () => {
  it("keeps the explicit and system dark blocks identical", () => {
    expect(dark).toEqual(darkSystem);
  });

  for (const [name, palette] of appearances) {
    it(`keeps chrome labels readable over the brightest star in ${name}`, () => {
      // The starfield caps opacity at 0.8. Blur softens the result, so this is
      // deliberately stricter than the rendered average.
      const starOverCanvas = blend(
        { rgb: rgba(palette["atmosphere-star"]).rgb, alpha: 0.8 },
        { rgb: rgba(palette["canvas"]).rgb, alpha: 1 },
      );
      const chromeOverStar = blend(rgba(palette["chrome-surface"]), {
        rgb: starOverCanvas,
        alpha: 1,
      });

      // Chrome uses primary and secondary labels only; muted copy belongs on
      // solid content surfaces.
      for (const role of ["text-primary", "text-secondary"] as const) {
        const value = contrastRgb(rgba(palette[role]).rgb, chromeOverStar);
        expect(
          value,
          `${role} on composited chrome over star`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`keeps every text role readable in ${name}`, () => {
      for (const role of textRoles) {
        for (const background of backgrounds) {
          expectMinimum(palette, role, background, 4.5);
        }
      }
    });

    it(`keeps action, control, and status pairings readable in ${name}`, () => {
      expectMinimum(palette, "on-accent", "accent", 4.5);
      expectMinimum(palette, "on-success", "success", 4.5);
      expectMinimum(palette, "on-warning", "warning", 4.5);
      expectMinimum(palette, "on-danger", "danger", 4.5);

      for (const role of ["accent", "success", "warning", "danger"] as const) {
        expectMinimum(palette, `on-${role === "accent" ? "accent" : role}`, `${role}-hover`, 4.5);
      }

      for (const background of backgrounds) {
        expectMinimum(palette, "border-control", background, 3);
      }

      expectMinimum(palette, "success", "success-soft", 4.5);
      expectMinimum(palette, "warning", "warning-soft", 4.5);
      expectMinimum(palette, "danger", "danger-soft", 4.5);

      for (let slot = 1; slot <= 6; slot += 1) {
        expectMinimum(
          palette,
          `identity-${slot}-ink`,
          `identity-${slot}-soft`,
          4.5,
        );
      }
    });
  }
});
